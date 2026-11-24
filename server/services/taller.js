// Reglas del Modo Taller. Funciones puras: no tocan la base de datos.
//
// El técnico atiende órdenes de trabajo. Cada orden entregada da experiencia según el nivel del
// escenario y cómo la resolvió: errores, errores críticos de seguridad, pistas, tiempo y si cambió
// refacciones que no hacían falta. La experiencia sube su nivel y el nivel desbloquea órdenes
// más difíciles. El diagnóstico también ubica: quien ya domina mucho no empieza como aprendiz.
// Valores de demostración; se calibran en un piloto.

export const NIVELES = [
  { id: 'aprendiz', nombre: 'Aprendiz', xp: 0 },
  { id: 'tecnico', nombre: 'Técnico', xp: 400 },
  { id: 'especialista', nombre: 'Especialista', xp: 1200 },
  { id: 'experto', nombre: 'Experto', xp: 2500 },
];

export const XP_BASE = { 1: 120, 2: 180, 3: 260 };
export const MINUTOS_LIMITE = { 1: 6, 2: 10, 3: 14 };

const PENALIZACION = { error: 20, critico: 60, pista: 10, desperdicio: 30 };

export function nivelPorXp(xp) {
  return NIVELES.reduce((nivel, n, i) => (xp >= n.xp ? i : nivel), 0);
}

/** Nivel en que lo ubica el diagnóstico según la parte de competencias que ya domina. */
export function nivelPorDominio(proporcionDominadas) {
  if (proporcionDominadas >= 0.75) return 3;
  if (proporcionDominadas >= 0.45) return 2;
  if (proporcionDominadas >= 0.2) return 1;
  return 0;
}

export function nivelEfectivo(xp, proporcionDominadas) {
  return Math.max(nivelPorXp(xp), nivelPorDominio(proporcionDominadas));
}

/** Un escenario de nivel Volvo n se abre desde el nivel de técnico n − 1 (Aprendiz hace nivel 1). */
export const desbloqueado = (nivelEscenario, indiceNivel) => nivelEscenario <= indiceNivel + 1;

export function progresoNivel(xp, indiceNivel) {
  const actual = NIVELES[indiceNivel];
  const siguiente = NIVELES[indiceNivel + 1] ?? null;
  return {
    ...actual,
    indice: indiceNivel,
    xp,
    siguiente: siguiente ? { nombre: siguiente.nombre, xp: siguiente.xp } : null,
    avance: siguiente ? Math.max(0, Math.min(1, (xp - actual.xp) / (siguiente.xp - actual.xp))) : 1,
  };
}

/**
 * Califica una orden entregada.
 * @returns {{ estrellas: 1|2|3, xp: number, desglose: Array<{ concepto: string, puntos: number }> }}
 */
export function calificarOrden({
  nivel,
  errores = 0,
  criticos = 0,
  pistas = 0,
  segundos = 0,
  gasto = 0,
  gastoNecesario = 0,
}) {
  const base = XP_BASE[nivel] ?? XP_BASE[1];
  const desperdicio = Math.max(0, gasto - gastoNecesario);
  const aTiempo = segundos <= (MINUTOS_LIMITE[nivel] ?? 10) * 60;
  const desglose = [{ concepto: 'Orden entregada', puntos: base }];
  if (errores) desglose.push({ concepto: `${errores} error(es)`, puntos: -PENALIZACION.error * errores });
  if (criticos) {
    desglose.push({
      concepto: `${criticos} error(es) crítico(s) de seguridad`,
      puntos: -PENALIZACION.critico * criticos,
    });
  }
  if (pistas) desglose.push({ concepto: `${pistas} pista(s)`, puntos: -PENALIZACION.pista * pistas });
  if (desperdicio) {
    desglose.push({
      concepto: `Refacciones de más: $${desperdicio.toLocaleString('es-MX')}`,
      puntos: -PENALIZACION.desperdicio,
    });
  }
  if (aTiempo) desglose.push({ concepto: 'A tiempo', puntos: Math.round(base * 0.2) });

  const total = desglose.reduce((suma, d) => suma + d.puntos, 0);
  // Siempre se gana algo por terminar: equivocarse y corregir también es aprender.
  const xp = Math.max(Math.round(base * 0.1), total);

  let estrellas = 1;
  if (criticos === 0 && errores <= 3) estrellas = 2;
  if (criticos === 0 && errores <= 1 && desperdicio === 0) estrellas = 3;
  return { estrellas, xp, desglose };
}

/** Reputación del taller del técnico: promedio de estrellas de sus últimas órdenes (0 a 3). */
export function reputacion(estrellas) {
  const ultimas = estrellas.slice(0, 10);
  if (!ultimas.length) return null;
  return Math.round((ultimas.reduce((s, e) => s + e, 0) / ultimas.length) * 10) / 10;
}
