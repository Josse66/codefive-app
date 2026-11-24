// Modelos del técnico. Funciones puras: no tocan la base de datos.
//
// BKT (Bayesian Knowledge Tracing, Corbett y Anderson, 1995): probabilidad de que el técnico
// domine una competencia, actualizada con cada respuesta.
// Elo (Pelánek): habilidad del técnico y dificultad de cada pregunta, ajustadas entre sí.

// Parámetros de demostración; se calibran con datos reales de un piloto.
export const PARAMETROS_BKT = {
  adivinar: 0.25, // opción múltiple de 4
  descuido: 0.1,
  aprender: 0.15, // en práctica; en el diagnóstico se usa 0 porque solo se mide
};

// Umbrales del prototipo, no criterios oficiales de Volvo.
export const UMBRALES = { dominada: 0.8, enDesarrollo: 0.4 };

/**
 * Actualiza la probabilidad de dominio después de una respuesta.
 * @param {number} pSaber probabilidad actual (0 a 1)
 * @param {boolean} correcta
 * @param {{ adivinar?: number, descuido?: number, aprender?: number }} [parametros]
 */
export function actualizarBKT(pSaber, correcta, parametros = {}) {
  const { adivinar, descuido, aprender } = { ...PARAMETROS_BKT, ...parametros };
  const posterior = correcta
    ? (pSaber * (1 - descuido)) / (pSaber * (1 - descuido) + (1 - pSaber) * adivinar)
    : (pSaber * descuido) / (pSaber * descuido + (1 - pSaber) * (1 - adivinar));
  return posterior + (1 - posterior) * aprender;
}

export function estadoDominio(pSaber) {
  if (pSaber >= UMBRALES.dominada) return 'dominada';
  if (pSaber >= UMBRALES.enDesarrollo) return 'en_desarrollo';
  return 'brecha';
}

// Probabilidad de acertar según la habilidad (theta) y la dificultad de la pregunta.
export function probabilidadElo(theta, dificultad) {
  return 1 / (1 + Math.exp(-(theta - dificultad)));
}

/**
 * Ajusta la habilidad del técnico y la dificultad de la pregunta después de una respuesta.
 * El ajuste de la pregunta se vuelve más fino conforme más técnicos la contestan.
 */
export function actualizarElo(theta, dificultad, correcta, respuestasPrevias = 0) {
  const esperado = probabilidadElo(theta, dificultad);
  const error = (correcta ? 1 : 0) - esperado;
  const kPregunta = 0.4 / (1 + 0.05 * respuestasPrevias);
  return {
    theta: theta + 0.6 * error,
    dificultad: dificultad - kPregunta * error,
  };
}

/**
 * Punto de partida del modelo antes del diagnóstico, según el perfil declarado.
 * Un técnico con experiencia en su tecnología parte más alto; en la otra tecnología, más bajo.
 */
export function priorInicial(tecnico, competencia) {
  const experiencia = Math.min(tecnico.anios_experiencia, 10) / 10;
  const mismaTecnologia = competencia.tecnologia === 'ambas' || competencia.tecnologia === tecnico.tecnologia;
  const base = mismaTecnologia ? 0.25 + 0.35 * experiencia : 0.15;
  const ajusteNivel = { 1: 0.1, 2: 0, 3: -0.1 }[competencia.nivel] ?? 0;
  return Math.min(0.9, Math.max(0.05, base + ajusteNivel));
}

// Cruce de confianza y acierto. "seguro_equivocado" es el caso más peligroso.
export function cuadranteConfianza(correcta, confianza) {
  const seguro = confianza === 3;
  if (correcta) return seguro ? 'seguro_correcto' : 'inseguro_correcto';
  return seguro ? 'seguro_equivocado' : 'inseguro_equivocado';
}
