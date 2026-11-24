import { randomUUID } from 'node:crypto';
import db from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { registrarEvento } from '#services/eventos.service.js';
import {
  asegurarDominio,
  guardarDominio,
  listarCompetencias,
  obtenerDominio,
  obtenerPerfil,
} from '#services/dominio.service.js';
import { actualizarBKT, actualizarElo } from '#services/modelo.js';

// Diagnóstico adaptativo por área (tecnología + grupo de función):
//   1. Empieza en nivel 2. Si acierta sube a nivel 3; si falla baja a nivel 1.
//   2. Las competencias críticas de seguridad del área siempre se preguntan directo.
//   3. Acertar un nivel hace inferir dominio de los niveles de abajo (no críticos);
//      fallar hace inferir brecha en los de arriba.
// Las sesiones viven en memoria: el diagnóstico dura minutos y los resultados ya quedan en la base.
const sesiones = new Map();

const INFERENCIA = { dominaAbajo: 0.8, brechaArriba: 0.2 };

function armarAreas() {
  const areas = new Map();
  listarCompetencias().forEach((c) => {
    const clave = `${c.tecnologia}-${c.grupo}`;
    if (!areas.has(clave)) areas.set(clave, { clave, competencias: [] });
    areas.get(clave).competencias.push(c);
  });
  return [...areas.values()].map((area) => {
    const niveles = [...new Set(area.competencias.map((c) => c.nivel))].sort();
    return {
      ...area,
      nivelActual: niveles.includes(2) ? 2 : niveles[0],
      nivelesVistos: [],
      criticasPendientes: area.competencias.filter((c) => c.critica).map((c) => c.id),
      theta: 0,
    };
  });
}

function preguntaDe(competenciaId, usadas) {
  return db
    .prepare('SELECT * FROM preguntas WHERE competencia_id = ? ORDER BY id')
    .all(competenciaId)
    .find((p) => !usadas.has(p.id));
}

// Siguiente pregunta de un área: primero el nivel que toca, luego las críticas pendientes.
// Devuelve null cuando el área ya quedó ubicada.
function pendienteDelArea(area, usadas) {
  const candidatas = [];
  if (area.nivelActual && !area.nivelesVistos.includes(area.nivelActual)) {
    area.competencias
      .filter((c) => c.nivel === area.nivelActual)
      .sort((a, b) => b.critica - a.critica)
      .forEach((c) => candidatas.push({ competencia: c, porNivel: true }));
  }
  area.criticasPendientes.forEach((id) =>
    candidatas.push({ competencia: area.competencias.find((c) => c.id === id), porNivel: false }),
  );
  const elegida = candidatas.find((c) => preguntaDe(c.competencia.id, usadas));
  if (!elegida) return null;
  const pregunta = preguntaDe(elegida.competencia.id, usadas);
  return { area, competencia: elegida.competencia, pregunta, porNivel: elegida.porNivel };
}

function elegirSiguiente(sesion) {
  return sesion.areas.map((area) => pendienteDelArea(area, sesion.usadas)).find(Boolean) ?? null;
}

function paraCliente(pendiente) {
  const { pregunta, competencia } = pendiente;
  return {
    id: pregunta.id,
    enunciado: pregunta.enunciado,
    opciones: JSON.parse(pregunta.opciones),
    competencia: {
      nombre: competencia.nombre,
      tecnologia: competencia.tecnologia,
      grupo: competencia.grupo,
      nivel: competencia.nivel,
      habilidad: competencia.habilidad,
    },
  };
}

function progreso(sesion) {
  const estimado = sesion.areas.reduce((total, a) => total + 2 + a.criticasPendientes.length, 0);
  return { respondidas: sesion.respondidas, estimado: Math.max(estimado, sesion.respondidas + 1) };
}

export function iniciarDiagnostico(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  asegurarDominio(tecnico);

  const sesion = {
    id: randomUUID(),
    tecnicoId,
    areas: armarAreas(),
    usadas: new Set(),
    respondidas: 0,
    pendiente: null,
  };
  sesion.pendiente = elegirSiguiente(sesion);
  sesiones.set(sesion.id, sesion);
  return { sesionId: sesion.id, pregunta: paraCliente(sesion.pendiente), progreso: progreso(sesion) };
}

function inferir(sesion, area, competencia, correcta) {
  area.competencias
    .filter((c) => !c.critica && c.id !== competencia.id)
    .forEach((c) => {
      const { p_saber: p } = obtenerDominio(sesion.tecnicoId, c.id);
      if (correcta && c.nivel < competencia.nivel) {
        guardarDominio(sesion.tecnicoId, c.id, { p_saber: Math.max(p, INFERENCIA.dominaAbajo) });
      } else if (!correcta && c.nivel > competencia.nivel) {
        guardarDominio(sesion.tecnicoId, c.id, { p_saber: Math.min(p, INFERENCIA.brechaArriba) });
      }
    });
}

// Solo se sube o baja una vez desde el nivel 2: con dos niveles vistos el área queda ubicada.
function siguienteNivel(area, competencia, correcta) {
  const nivelesVistos = [...area.nivelesVistos, competencia.nivel];
  const niveles = area.competencias.map((c) => c.nivel);
  const siguiente = correcta ? competencia.nivel + 1 : competencia.nivel - 1;
  const puedeMoverse = niveles.includes(siguiente) && !nivelesVistos.includes(siguiente);
  return { nivelesVistos, nivelActual: puedeMoverse && nivelesVistos.length < 2 ? siguiente : null };
}

export function responderDiagnostico(sesionId, { preguntaId, opcion, confianza, ms, inputDevice }) {
  const sesion = sesiones.get(sesionId);
  if (!sesion) throw errorHttp(404, 'La sesión de diagnóstico no existe o ya terminó');
  const { pendiente } = sesion;
  if (!pendiente || pendiente.pregunta.id !== preguntaId) {
    throw errorHttp(400, 'La respuesta no corresponde a la pregunta actual');
  }
  if (![1, 2, 3].includes(confianza)) throw errorHttp(400, 'La confianza debe ser 1, 2 o 3');

  const { area, competencia, pregunta, porNivel } = pendiente;
  const correcta = opcion === pregunta.correcta;

  registrarEvento({
    tecnico_id: sesion.tecnicoId,
    tipo: 'respuesta',
    fase: 'diagnostico',
    competencia_id: competencia.id,
    pregunta_id: pregunta.id,
    correcta,
    critico: competencia.critica && !correcta,
    confianza,
    input_device: inputDevice ?? 'mouse',
    ms: Number.isFinite(ms) ? Math.round(ms) : null,
  });

  // En el diagnóstico solo se mide: el modelo no supone aprendizaje (aprender = 0).
  const dominio = obtenerDominio(sesion.tecnicoId, competencia.id);
  guardarDominio(sesion.tecnicoId, competencia.id, {
    p_saber: actualizarBKT(dominio.p_saber, correcta, { aprender: 0 }),
    intentos: dominio.intentos + 1,
    aciertos: dominio.aciertos + (correcta ? 1 : 0),
    ultima_practica: new Date().toISOString(),
  });
  inferir(sesion, area, competencia, correcta);

  const elo = actualizarElo(area.theta, pregunta.dificultad, correcta, pregunta.respuestas);
  area.theta = elo.theta;
  db.prepare('UPDATE preguntas SET dificultad = ?, respuestas = respuestas + 1 WHERE id = ?').run(
    elo.dificultad,
    pregunta.id,
  );

  area.criticasPendientes = area.criticasPendientes.filter((id) => id !== competencia.id);
  if (porNivel) Object.assign(area, siguienteNivel(area, competencia, correcta));

  sesion.usadas.add(pregunta.id);
  sesion.respondidas += 1;
  sesion.pendiente = elegirSiguiente(sesion);

  if (!sesion.pendiente) {
    sesiones.delete(sesionId);
    return { terminado: true, perfil: obtenerPerfil(sesion.tecnicoId) };
  }
  return { terminado: false, pregunta: paraCliente(sesion.pendiente), progreso: progreso(sesion) };
}
