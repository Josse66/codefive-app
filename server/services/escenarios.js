import fs from 'node:fs';
import path from 'node:path';

// Motor de escenarios. Cada escenario es un archivo JSON en data/escenarios/: agregar uno nuevo
// es escribir su archivo, no programar otra escena.
//
// Paso de hipótesis: el técnico elige una opción; `correcta` es la letra.
// Paso de acción:   el técnico aplica una herramienta a una pieza ("candado>desconexion_servicio");
//                   `correcta` es la secuencia de acciones en orden.
// `errores` asocia una opción o acción equivocada con su código, si es crítica y su consecuencia;
// '*' es el error por omisión. El servidor califica; el navegador solo muestra.

const carpeta = path.resolve('data', 'escenarios');

function validar(escenario, archivo) {
  const falta = ['id', 'grupo', 'competencia', 'titulo', 'pasos'].filter((campo) => !escenario[campo]);
  if (falta.length) throw new Error(`${archivo}: faltan los campos ${falta.join(', ')}`);
  escenario.pasos.forEach((paso) => {
    if (!['hipotesis', 'accion'].includes(paso.tipo)) {
      throw new Error(`${archivo}: el paso ${paso.id} tiene un tipo desconocido`);
    }
    if (paso.tipo === 'accion' && !Array.isArray(paso.correcta)) {
      throw new Error(`${archivo}: el paso ${paso.id} debe declarar su secuencia de acciones`);
    }
  });
  return escenario;
}

const escenarios = new Map(
  fs
    .readdirSync(carpeta)
    .filter((archivo) => archivo.endsWith('.json'))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((archivo) => {
      const escenario = validar(JSON.parse(fs.readFileSync(path.join(carpeta, archivo), 'utf8')), archivo);
      return [escenario.id, escenario];
    }),
);

export const listarEscenarios = () => [...escenarios.values()];
export const obtenerEscenario = (id) => escenarios.get(id) ?? null;

/** Competencia a escenario: la principal y las que declara cada paso. */
export function escenariosPorCompetencia() {
  const mapa = {};
  listarEscenarios().forEach((e) => {
    mapa[e.competencia] ??= e.id;
    e.pasos.forEach((p) => {
      if (p.competencia) mapa[p.competencia] ??= e.id;
    });
  });
  return mapa;
}

export const competenciaDelPaso = (escenario, paso) => paso.competencia ?? escenario.competencia;

/** Lo que ve el navegador: sin respuestas, explicaciones ni errores. */
export function paraCliente(escenario) {
  const { pasos, ...resto } = escenario;
  return {
    ...resto,
    pasos: pasos.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      pregunta: p.pregunta ?? null,
      instruccion: p.instruccion ?? null,
      opciones: p.opciones ?? null,
      acciones: p.tipo === 'accion' ? p.correcta.length : null,
      pista: p.pista ?? null,
    })),
  };
}

export const progresoInicial = () => ({ paso: 0, subpaso: 0, terminado: false, errores: 0, criticos: 0 });

/**
 * Califica un intento contra el paso actual. Función pura.
 * @returns {{ correcta, completaPaso, terminado, error, explicacion, efecto, progreso }}
 */
export function evaluarIntento(escenario, progreso, { pasoId, accion, opcion }) {
  if (progreso.terminado) {
    return { invalido: 'El escenario ya terminó' };
  }
  const paso = escenario.pasos[progreso.paso];
  if (paso.id !== pasoId) {
    return { invalido: `Ahora toca el paso "${paso.id}"` };
  }

  const respuesta = paso.tipo === 'hipotesis' ? opcion : accion;
  if (!respuesta) return { invalido: 'Falta la opción o la acción' };
  const esperada = paso.tipo === 'hipotesis' ? paso.correcta : paso.correcta[progreso.subpaso];

  if (respuesta === esperada) {
    const ultimoSubpaso = paso.tipo === 'hipotesis' || progreso.subpaso + 1 >= paso.correcta.length;
    const siguiente = { ...progreso };
    if (ultimoSubpaso) {
      siguiente.paso += 1;
      siguiente.subpaso = 0;
      siguiente.terminado = siguiente.paso >= escenario.pasos.length;
    } else {
      siguiente.subpaso += 1;
    }
    return {
      correcta: true,
      completaPaso: ultimoSubpaso,
      terminado: siguiente.terminado,
      error: null,
      explicacion: ultimoSubpaso ? paso.explicacion : null,
      efecto: ultimoSubpaso ? (paso.efecto ?? null) : null,
      progreso: siguiente,
    };
  }

  const error = paso.errores?.[respuesta] ??
    paso.errores?.['*'] ?? {
      codigo: null,
      critico: false,
      consecuencia: 'reintentar',
      mensaje: 'No es correcto',
    };
  return {
    correcta: false,
    completaPaso: false,
    terminado: false,
    error: {
      codigo: error.codigo ?? null,
      critico: Boolean(error.critico),
      consecuencia: error.consecuencia ?? 'reintentar',
      efecto: error.efecto ?? null,
      mensaje: error.mensaje,
    },
    explicacion: null,
    efecto: error.efecto ?? null,
    // Una secuencia equivocada vuelve a empezar: "probar, medir, volver a probar" va completo.
    progreso: {
      ...progreso,
      subpaso: 0,
      errores: progreso.errores + 1,
      criticos: progreso.criticos + (error.critico ? 1 : 0),
    },
  };
}
