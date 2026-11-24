// Flota sintética para la demostración: técnicos ficticios en distintos puntos de servicio que
// hacen el diagnóstico, atienden órdenes del Taller y presentan evaluaciones. Todo pasa por los
// mismos servicios que usa la app, así que el panel de Volvo se llena con datos coherentes.
// Datos sintéticos, declarados así en la memoria técnica. Uso: npm run db:demo
import fs from 'node:fs';
import path from 'node:path';
import db from '#db/conexion.js';
import logger from '#config/logger.js';
import { iniciarDiagnostico, responderDiagnostico } from '#services/diagnostico.service.js';
import { responderPractica } from '#services/practica.service.js';
import { obtenerEvaluacion, responderEvaluacion, simularDias } from '#services/evaluacion.service.js';
import { iniciarOrden, intentoEnOrden, obtenerTaller } from '#services/taller.service.js';
import { obtenerEscenario } from '#services/escenarios.js';
import { crearCuenta } from '#services/cuentas.service.js';
import { elegirModelo } from '#services/modelos.service.js';

// Generador con semilla: la flota sale igual cada vez que se corre.
// Generador de Park y Miller: suficiente para datos de demostración.
function generador(semilla) {
  let a = semilla;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}
const azar = generador(2026);

// habilidad: qué tan seguido acierta (0 a 1). descuido: probabilidad de un error crítico de seguridad.
const FLOTA = [
  {
    id: 'T-05',
    modelo: '9800',
    nombre: 'Diego Hernández',
    taller: 'PSV Culiacán',
    anios: 5,
    tecnologia: 'diesel',
    habilidad: 0.72,
    descuido: 0.1,
  },
  {
    id: 'T-06',
    modelo: 'luminus',
    nombre: 'Mariana López',
    taller: 'PSV Guadalajara',
    anios: 2,
    tecnologia: 'electrica',
    habilidad: 0.58,
    descuido: 0.08,
  },
  {
    id: 'T-07',
    modelo: '9700',
    nombre: 'Jorge Ramírez',
    taller: 'PSV Puebla',
    anios: 15,
    tecnologia: 'diesel',
    habilidad: 0.82,
    descuido: 0.05,
  },
  {
    id: 'T-08',
    modelo: '7800-electric',
    nombre: 'Fernanda Castillo',
    taller: 'PSV Mérida',
    anios: 1,
    tecnologia: 'electrica',
    habilidad: 0.48,
    descuido: 0.12,
  },
  {
    id: 'T-09',
    modelo: '7300-brt',
    nombre: 'Ricardo Navarro',
    taller: 'PSV Veracruz',
    anios: 9,
    tecnologia: 'diesel',
    habilidad: 0.66,
    descuido: 0.15,
  },
  {
    id: 'T-10',
    modelo: '7800-electric',
    nombre: 'Paola Jiménez',
    taller: 'WSI Texcoco',
    anios: 4,
    tecnologia: 'electrica',
    habilidad: 0.62,
    descuido: 0.06,
  },
  {
    id: 'T-11',
    modelo: 'b13r',
    nombre: 'Héctor Salinas',
    taller: 'PSV San Luis',
    anios: 20,
    tecnologia: 'diesel',
    habilidad: 0.76,
    descuido: 0.3,
  },
  {
    id: 'T-12',
    modelo: '9800-dd',
    nombre: 'Daniela Ortiz',
    taller: 'PSV Durango',
    anios: 0,
    tecnologia: 'diesel',
    habilidad: 0.42,
    descuido: 0.1,
  },
  {
    id: 'T-13',
    modelo: '7700-hibrido',
    nombre: 'Luis Ángel Vega',
    taller: 'PSV Tuxtla',
    anios: 6,
    tecnologia: 'diesel',
    habilidad: 0.6,
    descuido: 0.12,
  },
  {
    id: 'T-14',
    modelo: 'luminus',
    nombre: 'Valeria Cruz',
    taller: 'PSV Querétaro',
    anios: 3,
    tecnologia: 'electrica',
    habilidad: 0.66,
    descuido: 0.07,
  },
];

const correctaDe = (preguntaId) =>
  db.prepare('SELECT correcta FROM preguntas WHERE id = ?').get(preguntaId).correcta;
const competenciaDe = (id) => db.prepare('SELECT * FROM competencias WHERE id = ?').get(id);

function probabilidadDeAcierto(tecnico, competencia) {
  const mismaTecnologia = competencia.tecnologia === 'ambas' || competencia.tecnologia === tecnico.tecnologia;
  const p = tecnico.habilidad + (mismaTecnologia ? 0.08 : -0.25) - (competencia.nivel - 2) * 0.1;
  return Math.min(0.95, Math.max(0.1, p));
}

function opcionEquivocada(correcta) {
  return ['a', 'b', 'c', 'd'].filter((o) => o !== correcta)[Math.floor(azar() * 3)];
}

// Confianza realista: quien acierta suele estar seguro; algunos se equivocan muy seguros.
function confianza(acierta, tecnico) {
  if (acierta) return azar() < 0.7 ? 3 : 2;
  return azar() < 0.2 + tecnico.descuido ? 3 : 1 + Math.floor(azar() * 2);
}

function diagnosticar(tecnico) {
  const inicio = iniciarDiagnostico(tecnico.id);
  const { sesionId } = inicio;
  let { pregunta } = inicio;
  for (let vueltas = 0; pregunta && vueltas < 60; vueltas += 1) {
    const competencia = db
      .prepare('SELECT c.* FROM preguntas p JOIN competencias c ON c.id = p.competencia_id WHERE p.id = ?')
      .get(pregunta.id);
    const correcta = correctaDe(pregunta.id);
    const acierta = azar() < probabilidadDeAcierto(tecnico, competencia);
    const r = responderDiagnostico(sesionId, {
      preguntaId: pregunta.id,
      opcion: acierta ? correcta : opcionEquivocada(correcta),
      confianza: confianza(acierta, tecnico),
      ms: 4000 + Math.round(azar() * 12000),
      inputDevice: 'mouse',
    });
    pregunta = r.terminado ? null : r.pregunta;
  }
}

// Atiende una orden paso por paso; puede equivocarse, cometer un error crítico o pedir pista.
function atenderOrden(tecnico, orden) {
  const { orden: enCurso } = iniciarOrden(tecnico.id, orden.id);
  const escenario = obtenerEscenario(enCurso.escenario.id);
  const competencia = competenciaDe(escenario.competencia);
  escenario.pasos.forEach((paso) => {
    const intentar = (cuerpo) =>
      intentoEnOrden({
        tecnicoId: tecnico.id,
        escenarioId: escenario.id,
        pasoId: paso.id,
        ordenId: orden.id,
        inputDevice: azar() < 0.15 ? 'guante' : 'mouse',
        ms: 3000 + Math.round(azar() * 9000),
        ...cuerpo,
      });
    const errores = Object.keys(paso.errores ?? {}).filter((k) => k !== '*');
    const criticos = errores.filter((k) => paso.errores[k].critico);
    if (criticos.length && azar() < tecnico.descuido) {
      const clave = criticos[Math.floor(azar() * criticos.length)];
      intentar(paso.tipo === 'accion' ? { accion: clave } : { opcion: clave });
    } else if (errores.length && azar() > probabilidadDeAcierto(tecnico, competencia)) {
      const clave = errores[Math.floor(azar() * errores.length)];
      if (!paso.errores[clave].critico)
        intentar(paso.tipo === 'accion' ? { accion: clave } : { opcion: clave });
    }
    const pista = azar() < 0.15;
    if (paso.tipo === 'accion')
      paso.correcta.forEach((accion, i) => intentar({ accion, pista: pista && i === 0 }));
    else intentar({ opcion: paso.correcta, pista });
  });
}

// Antes, práctica, después y diferida de la competencia principal de una orden.
function evaluar(tecnico, competenciaId) {
  const contestar = (momento) => {
    const { preguntas } = obtenerEvaluacion(tecnico.id, competenciaId);
    const competencia = competenciaDe(competenciaId);
    const bono = { pre: -0.15, post: 0.2, diferida: 0 }[momento];
    responderEvaluacion(tecnico.id, competenciaId, {
      momento,
      respuestas: preguntas.map((p) => {
        const correcta = correctaDe(p.id);
        const acierta = azar() < probabilidadDeAcierto(tecnico, competencia) + bono;
        return {
          preguntaId: p.id,
          opcion: acierta ? correcta : opcionEquivocada(correcta),
          confianza: confianza(acierta, tecnico),
        };
      }),
    });
  };
  if (obtenerEvaluacion(tecnico.id, competenciaId).siguiente !== 'pre') return;
  contestar('pre');
  db.prepare("SELECT id FROM preguntas WHERE competencia_id = ? AND banco = 'practica'")
    .all(competenciaId)
    .forEach((p) =>
      responderPractica(tecnico.id, { preguntaId: p.id, opcion: correctaDe(p.id), confianza: 2 }),
    );
  contestar('post');
  if (azar() < 0.7) {
    const { diasDiferida, diasDesdePost } = obtenerEvaluacion(tecnico.id, competenciaId);
    simularDias(tecnico.id, diasDiferida - diasDesdePost);
    contestar('diferida');
  }
}

const { contrasenaDemo } = JSON.parse(fs.readFileSync(path.resolve('data', 'cuentas.json'), 'utf8'));
// "Luis Ángel Vega" → luis.angel.vega@codefive.demo
const correoDe = (nombre) =>
  `${nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(' ')
    .join('.')}@codefive.demo`;

const insertar = db.prepare(
  `INSERT OR IGNORE INTO tecnicos (id, nombre, taller, anios_experiencia, tecnologia, perfil)
   VALUES (?, ?, ?, ?, ?, 'sintetico')`,
);

const yaHay = db.prepare("SELECT COUNT(*) AS n FROM tecnicos WHERE perfil = 'sintetico'").get().n;
if (yaHay) {
  logger.warn(`Ya hay ${yaHay} técnicos sintéticos. Corre "npm run db:reset" antes para empezar limpio.`);
} else {
  FLOTA.forEach((tecnico) => {
    insertar.run(tecnico.id, tecnico.nombre, tecnico.taller, tecnico.anios, tecnico.tecnologia);
    elegirModelo(tecnico.id, tecnico.modelo);
    // Cuenta de demostración: nombre.apellido@codefive.demo con la contraseña de data/cuentas.json.
    crearCuenta({
      correo: correoDe(tecnico.nombre),
      nombre: tecnico.nombre,
      rol: 'tecnico',
      tecnicoId: tecnico.id,
      contrasena: contrasenaDemo,
    });
    diagnosticar(tecnico);
    const ordenes = 2 + Math.floor(azar() * 3);
    for (let i = 0; i < ordenes; i += 1) {
      const [orden] = obtenerTaller(tecnico.id).bahia;
      if (!orden) break;
      atenderOrden(tecnico, orden);
      if (i === 0) evaluar(tecnico, orden.escenario.competencia);
    }
  });
  const totales = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM eventos) AS eventos,
              (SELECT COUNT(*) FROM ordenes WHERE estado = 'entregada') AS ordenes,
              (SELECT COUNT(*) FROM evaluaciones) AS evaluaciones`,
    )
    .get();
  logger.warn(
    `Flota sintética lista: ${FLOTA.length} técnicos, ${totales.ordenes} órdenes entregadas, ${totales.evaluaciones} evaluaciones, ${totales.eventos} eventos`,
  );
}

db.close();
