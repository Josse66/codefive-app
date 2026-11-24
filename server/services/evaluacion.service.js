import db, { transaccion } from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { registrarEvento } from '#services/eventos.service.js';
import { asegurarDominio, guardarDominio, obtenerDominio } from '#services/dominio.service.js';
import {
  actualizarBKT,
  aplicarOlvido,
  estabilidadTrasPractica,
  estabilidadTrasRepaso,
} from '#services/modelo.js';

// Evaluación de una competencia en tres momentos, para medir aprendizaje y retención:
//   pre      antes de practicar, con el banco de evaluación (sin ayuda ni retroalimentación).
//   post     justo después de practicar, con las mismas preguntas del pre: la diferencia es lo aprendido.
//   diferida después de simular días sin practicar, con las preguntas de la práctica en otro orden.
//            Antes de calificarla se aplica la curva de olvido; el resultado ajusta la estabilidad.
// Las evaluaciones solo miden: el modelo no supone aprendizaje (aprender = 0).

export const DIAS_DIFERIDA = 7;
const DIAS_CURVA = 21;
const PREGUNTAS_POR_MOMENTO = 2;

function validar(tecnicoId, competenciaId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  const competencia = db.prepare('SELECT * FROM competencias WHERE id = ?').get(competenciaId);
  if (!competencia) throw errorHttp(404, 'Competencia no encontrada');
  asegurarDominio(tecnico);
  return { tecnico, competencia };
}

function momentosDe(tecnicoId, competenciaId) {
  const filas = db
    .prepare('SELECT * FROM evaluaciones WHERE tecnico_id = ? AND competencia_id = ? ORDER BY id')
    .all(tecnicoId, competenciaId);
  return Object.fromEntries(
    ['pre', 'post', 'diferida'].map((f) => [f, filas.findLast((e) => e.fase === f) ?? null]),
  );
}

function practicoDespuesDe(tecnicoId, competenciaId, eventoId) {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM eventos
         WHERE tecnico_id = ? AND competencia_id = ? AND fase = 'practica' AND id > ?`,
      )
      .get(tecnicoId, competenciaId, eventoId).n > 0
  );
}

function siguienteMomento(momentos, practicada, diasDesdePost) {
  if (!momentos.pre) return 'pre';
  if (!momentos.post) return practicada ? 'post' : 'practica';
  if (!momentos.diferida) return diasDesdePost >= DIAS_DIFERIDA ? 'diferida' : 'esperar';
  return 'completa';
}

// Cambia el orden de las opciones sin depender del azar: la misma pregunta siempre sale igual.
function reordenar(opciones, semilla) {
  const corrimiento =
    1 + ([...semilla].reduce((suma, letra) => suma + letra.charCodeAt(0), 0) % (opciones.length - 1));
  return [...opciones.slice(corrimiento), ...opciones.slice(0, corrimiento)];
}

function preguntasDe(competenciaId, momento) {
  const banco = momento === 'diferida' ? 'practica' : 'evaluacion';
  return db
    .prepare('SELECT * FROM preguntas WHERE competencia_id = ? AND banco = ? ORDER BY id LIMIT ?')
    .all(competenciaId, banco, PREGUNTAS_POR_MOMENTO);
}

function paraCliente(pregunta, momento) {
  const opciones = JSON.parse(pregunta.opciones);
  return {
    id: pregunta.id,
    enunciado: pregunta.enunciado,
    opciones: momento === 'diferida' ? reordenar(opciones, pregunta.id) : opciones,
  };
}

function resumenMomento(fila) {
  if (!fila) return null;
  return {
    aciertos: fila.aciertos,
    total: fila.total,
    pSaber: Math.round(fila.p_saber * 100) / 100,
    estabilidad: Math.round(fila.estabilidad * 10) / 10,
    dia: fila.dia,
  };
}

// Dominio esperado día por día: tramo después de practicar y, si ya hubo revisión diferida, tramo después del repaso.
function curvaDeOlvido(momentos) {
  const { pre, post, diferida } = momentos;
  if (!pre || !post) return null;
  const tramo = (desde, hasta, fila) =>
    Array.from({ length: hasta - desde + 1 }, (_, i) => ({
      dia: desde + i,
      p: Math.round(aplicarOlvido(fila.p_saber, pre.p_saber, i, fila.estabilidad) * 1000) / 1000,
    }));
  const diaRepaso = diferida ? diferida.dia - post.dia : null;
  return {
    dias: DIAS_CURVA,
    partida: pre.p_saber,
    trasPractica: tramo(0, diaRepaso ?? DIAS_CURVA, post),
    trasRepaso: diferida ? tramo(diaRepaso, Math.max(DIAS_CURVA, diaRepaso), diferida) : null,
  };
}

export function obtenerEvaluacion(tecnicoId, competenciaId) {
  const { tecnico, competencia } = validar(tecnicoId, competenciaId);
  const momentos = momentosDe(tecnico.id, competencia.id);
  const practicada = momentos.pre
    ? practicoDespuesDe(tecnico.id, competencia.id, momentos.pre.ultimo_evento)
    : false;
  const diasDesdePost = momentos.post ? tecnico.dias_simulados - momentos.post.dia : null;
  const siguiente = siguienteMomento(momentos, practicada, diasDesdePost);
  const { pre, post, diferida } = momentos;

  return {
    tecnico: { id: tecnico.id, nombre: tecnico.nombre, diasSimulados: tecnico.dias_simulados },
    competencia: { ...competencia, critica: competencia.critica === 1 },
    siguiente,
    diasDiferida: DIAS_DIFERIDA,
    diasDesdePost,
    momentos: { pre: resumenMomento(pre), post: resumenMomento(post), diferida: resumenMomento(diferida) },
    indicadores: {
      // Puntos de dominio ganados con la práctica.
      ganancia: pre && post ? Math.round((post.p_saber - pre.p_saber) * 100) : null,
      // Qué parte del dominio alcanzado conservó después de los días sin practicar.
      retencion: post && diferida ? Math.round(Math.min(1, diferida.p_saber / post.p_saber) * 100) : null,
    },
    curva: curvaDeOlvido(momentos),
    preguntas: ['pre', 'post', 'diferida'].includes(siguiente)
      ? preguntasDe(competencia.id, siguiente).map((p) => paraCliente(p, siguiente))
      : [],
  };
}

export function responderEvaluacion(tecnicoId, competenciaId, { momento, respuestas }) {
  const estado = obtenerEvaluacion(tecnicoId, competenciaId);
  if (momento !== estado.siguiente) {
    throw errorHttp(409, `Ahora no toca la evaluación "${momento}"; toca "${estado.siguiente}"`);
  }
  const preguntas = preguntasDe(competenciaId, momento);
  const porPregunta = new Map((respuestas ?? []).map((r) => [r.preguntaId, r]));
  if (preguntas.some((p) => !porPregunta.has(p.id))) {
    throw errorHttp(400, 'Faltan respuestas de la evaluación');
  }
  if ([...porPregunta.values()].some((r) => ![1, 2, 3].includes(Number(r.confianza)))) {
    throw errorHttp(400, 'La confianza debe ser 1, 2 o 3');
  }

  const competencia = db.prepare('SELECT * FROM competencias WHERE id = ?').get(competenciaId);
  const { dias_simulados: diaActual } = obtenerTecnico(tecnicoId);
  const momentos = momentosDe(tecnicoId, competenciaId);

  const detalle = transaccion(() => {
    const dominio = obtenerDominio(tecnicoId, competenciaId);
    let pSaber = dominio.p_saber;
    // Revisión diferida: primero se descuenta lo que se olvidó en los días sin practicar.
    if (momento === 'diferida') {
      pSaber = aplicarOlvido(
        pSaber,
        momentos.pre.p_saber,
        diaActual - momentos.post.dia,
        momentos.post.estabilidad,
      );
    }

    const calificadas = preguntas.map((pregunta) => {
      const respuesta = porPregunta.get(pregunta.id);
      const correcta = respuesta.opcion === pregunta.correcta;
      registrarEvento({
        tecnico_id: tecnicoId,
        tipo: 'respuesta',
        fase: momento,
        competencia_id: competenciaId,
        pregunta_id: pregunta.id,
        correcta,
        critico: competencia.critica === 1 && !correcta,
        confianza: Number(respuesta.confianza),
        input_device: respuesta.inputDevice ?? 'mouse',
        ms: Number.isFinite(Number(respuesta.ms)) ? Math.round(Number(respuesta.ms)) : null,
      });
      pSaber = actualizarBKT(pSaber, correcta, { aprender: 0 });
      return {
        preguntaId: pregunta.id,
        enunciado: pregunta.enunciado,
        correcta,
        correctaId: pregunta.correcta,
        explicacion: pregunta.explicacion,
        fuente: pregunta.fuente,
      };
    });

    const aciertos = calificadas.filter((c) => c.correcta).length;
    const proporcion = aciertos / calificadas.length;
    let { estabilidad } = dominio;
    if (momento === 'post') estabilidad = estabilidadTrasPractica(proporcion);
    if (momento === 'diferida') estabilidad = estabilidadTrasRepaso(momentos.post.estabilidad, proporcion);

    guardarDominio(tecnicoId, competenciaId, {
      p_saber: pSaber,
      estabilidad,
      intentos: dominio.intentos + calificadas.length,
      aciertos: dominio.aciertos + aciertos,
      ultima_practica: new Date().toISOString(),
    });
    const { ultimo } = db.prepare('SELECT COALESCE(MAX(id), 0) AS ultimo FROM eventos').get();
    db.prepare(
      `INSERT INTO evaluaciones (tecnico_id, competencia_id, fase, aciertos, total, p_saber, estabilidad, dia, ultimo_evento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      tecnicoId,
      competenciaId,
      momento,
      aciertos,
      calificadas.length,
      pSaber,
      estabilidad,
      diaActual,
      ultimo,
    );
    return calificadas;
  });

  return { resultado: { momento, detalle }, evaluacion: obtenerEvaluacion(tecnicoId, competenciaId) };
}

// Adelanta el reloj del técnico para la revisión diferida (en la demo no se esperan 7 días reales).
export function simularDias(tecnicoId, dias = DIAS_DIFERIDA) {
  if (!obtenerTecnico(tecnicoId)) throw errorHttp(404, 'Técnico no encontrado');
  const cuantos = Number(dias);
  if (!Number.isInteger(cuantos) || cuantos < 1 || cuantos > 60) {
    throw errorHttp(400, 'Los días a simular deben ser un entero entre 1 y 60');
  }
  db.prepare('UPDATE tecnicos SET dias_simulados = dias_simulados + ? WHERE id = ?').run(cuantos, tecnicoId);
  return { diasSimulados: obtenerTecnico(tecnicoId).dias_simulados };
}
