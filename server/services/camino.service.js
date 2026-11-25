import fs from 'node:fs';
import path from 'node:path';
import { APROBACION, obtenerSimulador } from '#services/simulador.service.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { errorHttp } from '#helpers/errores.js';

// Mi camino: la pantalla de inicio del técnico. Cada sistema del autobús es una unidad con sus
// puntos en orden (Diagnóstico → Conoce → Encuéntralo → [Práctica] → Comprueba → [Manos] → [Orden]) y un
// solo botón Continuar que lleva al siguiente punto que toca, dentro del autobús 3D.

const DATOS = JSON.parse(fs.readFileSync(path.resolve('data', 'autobus', 'piezas.json'), 'utf8'));
// Entrena tus manos: el ejercicio de postura que corresponde a cada sistema (si tiene).
const MANOS = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.resolve('data', 'manos', 'ejercicios.json'), 'utf8')).ejercicios.map(
    (e) => [e.sistema, e],
  ),
);

const PUNTOS = {
  diagnostico: 'Diagnóstico',
  conoce: 'Conoce',
  encuentra: 'Encuéntralo',
  libre: 'Práctica',
  comprueba: 'Comprueba',
  manos: 'Manos',
  orden: 'Orden de taller',
};

/** Puntos de un sistema con su estado: hecho, disponible, bloqueado u omitido. */
function puntosDe(sistema, p, pasoAPaso) {
  const piezas = sistema.orden.length;
  const conocidas = (p.conoce ?? []).length >= piezas;
  const empezado = (p.conoce ?? []).length > 0 || p.comprueba != null;
  const estadoDe = (hecho, disponible) => {
    if (hecho) return 'hecho';
    return disponible ? 'disponible' : 'bloqueado';
  };
  const puntos = [
    {
      id: 'diagnostico',
      // Si ya empezó a aprender sin diagnóstico, ya no mide el "antes": se omite.
      estado: p.diagnostico == null && empezado ? 'omitido' : estadoDe(p.diagnostico != null, true),
      nota: p.diagnostico ?? null,
    },
    { id: 'conoce', estado: estadoDe(conocidas, true), detalle: `${(p.conoce ?? []).length} de ${piezas}` },
    { id: 'encuentra', estado: estadoDe(Boolean(p.encuentra), conocidas) },
  ];
  if (pasoAPaso) puntos.push({ id: 'libre', estado: estadoDe(Boolean(p.libre), Boolean(p.encuentra)) });
  puntos.push({
    id: 'comprueba',
    estado: estadoDe(p.comprueba >= APROBACION, Boolean(p.encuentra)),
    nota: p.comprueba ?? null,
  });
  // Postura de las manos con la herramienta del sistema: se puede hacer en cualquier momento.
  if (MANOS[sistema.id])
    puntos.push({ id: 'manos', estado: estadoDe(p.manos >= APROBACION, true), nota: p.manos ?? null });
  if (sistema.orden_taller)
    puntos.push({ id: 'orden', estado: estadoDe(p.orden >= APROBACION, true), nota: p.orden ?? null });
  return puntos.map((punto) => ({ ...punto, nombre: PUNTOS[punto.id] }));
}

export function obtenerCamino(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  const pasoAPaso = tecnico.experiencia === 'mayor';
  const { progreso, sesiones, segundos, indices } = obtenerSimulador(tecnicoId);

  const unidades = DATOS.sistemas.map((sistema) => {
    const p = progreso[sistema.id] ?? {};
    const puntos = puntosDe(sistema, p, pasoAPaso);
    const pendiente = puntos.find((x) => x.estado === 'disponible');
    const hechos = puntos.filter((x) => x.estado === 'hecho').length;
    return {
      id: sistema.id,
      nombre: sistema.nombre,
      grupo: sistema.grupo,
      resumen: sistema.resumen,
      acreditado: p.comprueba >= APROBACION,
      empezado: puntos.some((x) => x.estado === 'hecho'),
      completo: !pendiente,
      hechos,
      total: puntos.filter((x) => x.estado !== 'omitido').length,
      pendiente,
      puntos,
    };
  });

  // Lo que toca: primero termina lo que ya empezó; si no, el siguiente sistema sin terminar.
  const actual = unidades.find((u) => u.empezado && !u.completo) ?? unidades.find((u) => !u.completo) ?? null;
  const enlace = (u, punto) =>
    punto === 'manos'
      ? `/tecnicos/${tecnicoId}/manos/${MANOS[u.id].id}`
      : `/tecnicos/${tecnicoId}/autobus?sistema=${u.id}&vuelta=${punto}`;
  unidades.forEach((u) => {
    Object.assign(u, { actual: u === actual });
    u.puntos.forEach((punto) =>
      Object.assign(punto, {
        enlace: punto.estado === 'bloqueado' ? null : enlace(u, punto.id),
        aqui: u === actual && punto === u.pendiente,
      }),
    );
  });

  const horas = segundos / 3600;
  return {
    tecnico,
    pasoAPaso,
    unidades,
    siguiente: actual
      ? {
          sistema: actual.nombre,
          grupo: actual.grupo,
          punto: actual.pendiente.nombre,
          enlace: enlace(actual, actual.pendiente.id),
        }
      : null,
    resumen: {
      sesiones,
      tiempo: horas >= 1 ? `${Math.round(horas * 10) / 10} h` : `${Math.round(segundos / 60)} min`,
      acreditados: indices.iefi.acreditados,
      sistemas: DATOS.sistemas.length,
      aprobacion: APROBACION,
    },
  };
}
