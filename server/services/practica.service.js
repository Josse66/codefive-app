import fs from 'node:fs';
import path from 'node:path';
import db from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { registrarEvento } from '#services/eventos.service.js';
import { asegurarDominio, guardarDominio, obtenerDominio } from '#services/dominio.service.js';
import { actualizarBKT, estadoDominio } from '#services/modelo.js';
import { modoDeAyuda } from '#services/ruta.js';

// Práctica de una competencia: microlección (según el modo de ayuda) y preguntas con retroalimentación.
// A diferencia del diagnóstico, aquí sí se enseña: se muestra la respuesta correcta, su explicación
// y la fuente, y el modelo supone aprendizaje en cada intento.

const lecciones = new Map(
  JSON.parse(fs.readFileSync(path.resolve('data', 'lecciones.json'), 'utf8')).map((l) => [
    l.competencia_id,
    l,
  ]),
);

// Acertar después de pedir pista es evidencia más débil: se trata como si adivinar fuera más probable.
const ADIVINAR_CON_PISTA = 0.5;

function validar(tecnicoId, competenciaId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  const competencia = db.prepare('SELECT * FROM competencias WHERE id = ?').get(competenciaId);
  if (!competencia) throw errorHttp(404, 'Competencia no encontrada');
  asegurarDominio(tecnico);
  return { tecnico, competencia };
}

export function iniciarPractica(tecnicoId, competenciaId) {
  const { tecnico, competencia } = validar(tecnicoId, competenciaId);
  const { p_saber: pSaber } = obtenerDominio(tecnico.id, competencia.id);
  const modo = modoDeAyuda(pSaber);
  const leccion = lecciones.get(competencia.id) ?? null;
  const preguntas = db
    .prepare(
      "SELECT id, enunciado, opciones FROM preguntas WHERE competencia_id = ? AND banco = 'practica' ORDER BY id",
    )
    .all(competencia.id)
    .map((p) => ({ id: p.id, enunciado: p.enunciado, opciones: JSON.parse(p.opciones) }));

  return {
    tecnico: { id: tecnico.id, nombre: tecnico.nombre },
    competencia: { ...competencia, critica: competencia.critica === 1 },
    modo,
    pSaber,
    // En modo autónomo no se muestra la lección ni hay pistas: tiene que resolverlo solo.
    leccion: modo === 'autonomo' ? null : leccion,
    pista: modo === 'con_pistas' ? (leccion?.pista ?? null) : null,
    preguntas,
  };
}

export function responderPractica(tecnicoId, { preguntaId, opcion, confianza, pista, ms, inputDevice }) {
  const pregunta = db.prepare('SELECT * FROM preguntas WHERE id = ?').get(preguntaId);
  if (!pregunta) throw errorHttp(404, 'Pregunta no encontrada');
  const { tecnico, competencia } = validar(tecnicoId, pregunta.competencia_id);
  if (confianza != null && ![1, 2, 3].includes(confianza))
    throw errorHttp(400, 'La confianza debe ser 1, 2 o 3');

  const correcta = opcion === pregunta.correcta;
  registrarEvento({
    tecnico_id: tecnico.id,
    tipo: 'respuesta',
    fase: 'practica',
    competencia_id: competencia.id,
    pregunta_id: pregunta.id,
    correcta,
    critico: competencia.critica === 1 && !correcta,
    pista: Boolean(pista),
    confianza: confianza ?? null,
    input_device: inputDevice ?? 'mouse',
    ms: Number.isFinite(ms) ? Math.round(ms) : null,
  });

  const dominio = obtenerDominio(tecnico.id, competencia.id);
  const pSaber = actualizarBKT(dominio.p_saber, correcta, pista ? { adivinar: ADIVINAR_CON_PISTA } : {});
  guardarDominio(tecnico.id, competencia.id, {
    p_saber: pSaber,
    intentos: dominio.intentos + 1,
    aciertos: dominio.aciertos + (correcta ? 1 : 0),
    ultima_practica: new Date().toISOString(),
  });

  return {
    correcta,
    correctaId: pregunta.correcta,
    explicacion: pregunta.explicacion,
    fuente: pregunta.fuente,
    dominio: {
      antes: dominio.p_saber,
      despues: pSaber,
      estado: estadoDominio(pSaber),
      modo: modoDeAyuda(pSaber),
    },
  };
}
