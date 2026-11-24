// Reglas de la ruta personalizada. Función pura: recibe el perfil y devuelve los pasos en orden.
//
// Orden:
//   1. Seguridad crítica que no domina, o en la que estaba "seguro pero equivocado" (refuerzo obligatorio).
//   2. Lo demás que no domina, de la brecha más grande a la más chica.
//   3. Una competencia queda bloqueada si su prerrequisito no está dominado: primero va el prerrequisito.
// El modo de ayuda se retira conforme sube el dominio: guiado → con pistas → autónomo.

import { UMBRALES } from './modelo.js';

// Competencias que ya tienen escenario de práctica (los JSON los arma el equipo de hardware y contenido).
export const ESCENARIOS = {
  'E3-2-SEG': 'hv-aislamiento',
  'E3-3-DIA': 'hv-aislamiento',
  'A5-2-DIA': 'frenos-fuga',
  'D2-3-DIA': 'dpf-regeneracion',
};

export function modoDeAyuda(pSaber) {
  if (pSaber < UMBRALES.enDesarrollo) return 'guiado';
  if (pSaber < UMBRALES.dominada) return 'con_pistas';
  return 'autonomo';
}

/**
 * @param {Array<{id, nombre, critica, pSaber, estado, prerequisito?}>} competencias
 * @param {Array<{competenciaId}>} alertas competencias con "seguro pero equivocado"
 */
export function armarRuta(competencias, alertas = []) {
  const porId = new Map(competencias.map((c) => [c.id, c]));
  const conAlerta = new Set(alertas.map((a) => a.competenciaId));
  const dominada = (id) => porId.get(id)?.estado === 'dominada';

  const pendientes = competencias.filter((c) => !dominada(c.id) || conAlerta.has(c.id));

  const prioridad = (c) => {
    if (c.critica && conAlerta.has(c.id)) return 0;
    if (c.critica) return 1;
    if (conAlerta.has(c.id)) return 2;
    return 3;
  };
  const ordenadas = [...pendientes].sort((a, b) => prioridad(a) - prioridad(b) || a.pSaber - b.pSaber);

  // Un prerrequisito pendiente siempre va antes que la competencia que depende de él.
  const ruta = [];
  const agregar = (c) => {
    if (ruta.some((p) => p.id === c.id)) return;
    const previo = c.prerequisito && porId.get(c.prerequisito);
    if (previo && !dominada(previo.id) && pendientes.includes(previo)) agregar(previo);
    ruta.push(c);
  };
  ordenadas.forEach(agregar);

  return ruta.map((c, indice) => {
    const bloqueadaPor = c.prerequisito && !dominada(c.prerequisito) ? porId.get(c.prerequisito) : null;
    let motivo = 'Brecha por cerrar';
    if (c.critica && conAlerta.has(c.id)) motivo = 'Seguridad crítica: respondió seguro y se equivocó';
    else if (c.critica) motivo = 'Seguridad crítica sin dominar';
    else if (conAlerta.has(c.id)) motivo = 'Respondió seguro y se equivocó';
    else if (ruta.some((otra) => otra.prerequisito === c.id)) motivo = 'Requisito de lo que sigue';
    return {
      orden: indice + 1,
      competencia: c,
      motivo,
      obligatoria: conAlerta.has(c.id) || c.critica,
      modo: modoDeAyuda(c.pSaber),
      bloqueadaPor: bloqueadaPor ? { id: bloqueadaPor.id, nombre: bloqueadaPor.nombre } : null,
      escenario: ESCENARIOS[c.id] ?? null,
    };
  });
}
