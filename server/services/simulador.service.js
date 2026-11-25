import fs from 'node:fs';
import path from 'node:path';
import db from '#db/conexion.js';
import { avisar } from '#config/envivo.js';
import { errorHttp } from '#helpers/errores.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';

// Simulador del autobús completo: sesiones con tiempo efectivo, bitácora de acciones,
// evaluaciones por sistema y los tres índices del panel de Volvo (definidos por el equipo):
//   IEF  = Dominio × 0.60 + Retención × 0.40        (inicial, final y diferida a 30 días)
//   ICO  = Precisión × 0.60 + Autonomía × 0.40      (acciones de la práctica)
//   IEFI = Avance × 0.60 + Cumplimiento de la reducción de tiempo × 0.40
// Los umbrales y la línea base son de demostración y se declaran en la memoria técnica.

const DATOS = JSON.parse(fs.readFileSync(path.resolve('data', 'autobus', 'piezas.json'), 'utf8'));
export const SISTEMAS = DATOS.sistemas.map(({ id, nombre, grupo }) => ({ id, nombre, grupo }));
const IDS_SISTEMA = new Set(SISTEMAS.map((s) => s.id));

export const APROBACION = 91;
export const DIAS_DIFERIDA = 30;
// Línea base de demostración: horas de práctica supervisada presencial por sistema.
export const LINEA_BASE_HORAS = 4;
const META_REDUCCION = 0.2;
const MAX_LATIDO_S = 60; // un latido nunca suma más de un minuto (evita tiempos inflados)

const ACTIVIDADES = new Set(['conoce', 'encuentra', 'comprueba', 'orden', 'libre']);
const RESULTADOS = new Set(['correcta', 'error', 'critico', 'ayuda']);

function tecnicoOError(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  return tecnico;
}

function validarSistema(sistema) {
  if (!IDS_SISTEMA.has(sistema)) throw errorHttp(400, `Sistema desconocido: ${sistema}`);
}

// ---------- Sesiones ----------

export function iniciarSesion(tecnicoId) {
  tecnicoOError(tecnicoId);
  const { lastInsertRowid } = db.prepare('INSERT INTO sim_sesiones (tecnico_id) VALUES (?)').run(tecnicoId);
  return { sesionId: Number(lastInsertRowid) };
}

export function latido(tecnicoId, sesionId, segundos) {
  const s = Math.max(0, Math.min(MAX_LATIDO_S, Math.round(Number(segundos) || 0)));
  const { changes } = db
    .prepare(
      "UPDATE sim_sesiones SET segundos = segundos + ?, ultimo = datetime('now') WHERE id = ? AND tecnico_id = ?",
    )
    .run(s, Number(sesionId), tecnicoId);
  if (!changes) throw errorHttp(404, 'Sesión no encontrada');
  return { ok: true };
}

// ---------- Bitácora de acciones ----------

const insertarAccion = db.prepare(
  `INSERT INTO sim_acciones (tecnico_id, sesion_id, sistema, actividad, intento, pieza, herramienta, paso, resultado, con_ayuda, detalle)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

export function registrarAcciones(tecnicoId, sesionId, acciones = []) {
  if (!Array.isArray(acciones) || acciones.length > 200) throw errorHttp(400, 'Lista de acciones inválida');
  let guardadas = 0;
  acciones.forEach((a) => {
    if (!IDS_SISTEMA.has(a.sistema) || !ACTIVIDADES.has(a.actividad) || !RESULTADOS.has(a.resultado)) return;
    insertarAccion.run(
      tecnicoId,
      sesionId ? Number(sesionId) : null,
      a.sistema,
      a.actividad,
      Math.max(1, Number(a.intento) || 1),
      a.pieza ?? null,
      a.herramienta ?? null,
      a.paso ?? null,
      a.resultado,
      a.conAyuda ? 1 : 0,
      a.detalle ? String(a.detalle).slice(0, 300) : null,
    );
    guardadas += 1;
    // Un error crítico se avisa al panel de Volvo en ese momento.
    if (a.resultado === 'critico') {
      const sistema = SISTEMAS.find((s) => s.id === a.sistema);
      avisar('evento', {
        tecnicoId,
        critico: true,
        competenciaId: `Simulador · ${sistema?.nombre ?? a.sistema}`,
        escenarioId: 'simulador',
        mensaje: a.detalle ?? 'Error crítico de seguridad en el simulador.',
      });
    }
  });
  if (guardadas) avisar('simulador', { tecnicoId });
  return { guardadas };
}

// ---------- Evaluaciones ----------

/**
 * tipo 'comprueba': la primera es la final; si ya pasaron 30 días (simulados) desde la final,
 * cuenta como diferida. tipo 'inicial' (diagnóstico) y 'orden' (orden de taller sola) se guardan tal cual.
 */
export function registrarEvaluacion(tecnicoId, { sistema, tipo, calificacion, detalle }) {
  validarSistema(sistema);
  const nota = Math.round(Number(calificacion));
  if (!Number.isFinite(nota) || nota < 0 || nota > 100) throw errorHttp(400, 'Calificación inválida');
  const { dias_simulados: dia } = tecnicoOError(tecnicoId);
  let momento = tipo;
  if (tipo === 'comprueba') {
    const final = db
      .prepare(
        "SELECT dia FROM sim_evaluaciones WHERE tecnico_id = ? AND sistema = ? AND momento = 'final' ORDER BY id LIMIT 1",
      )
      .get(tecnicoId, sistema);
    momento = final && dia - final.dia >= DIAS_DIFERIDA ? 'diferida' : 'final';
  }
  if (!['inicial', 'final', 'diferida', 'orden'].includes(momento)) throw errorHttp(400, 'Tipo inválido');
  db.prepare(
    'INSERT INTO sim_evaluaciones (tecnico_id, sistema, momento, calificacion, dia, detalle) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(tecnicoId, sistema, momento, nota, dia, detalle ? JSON.stringify(detalle).slice(0, 2000) : null);
  avisar('simulador', { tecnicoId });
  return { momento, calificacion: nota };
}

// ---------- Avance de las vueltas ----------

export function guardarProgreso(tecnicoId, sistema, datos) {
  validarSistema(sistema);
  const texto = JSON.stringify(datos ?? {});
  if (texto.length > 5000) throw errorHttp(400, 'Avance demasiado grande');
  db.prepare(
    `INSERT INTO sim_progreso (tecnico_id, sistema, datos) VALUES (?, ?, ?)
     ON CONFLICT (tecnico_id, sistema) DO UPDATE SET datos = excluded.datos, actualizado = datetime('now')`,
  ).run(tecnicoId, sistema, texto);
  return { ok: true };
}

// ---------- Índices ----------

const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x) => (x == null ? null : Math.round(x * 100));

/** IEF, ICO e IEFI de un técnico, con sus componentes y metas (todo en 0..100). */
export function calcularIndices(tecnicoId) {
  const evals = db
    .prepare(
      'SELECT sistema, momento, calificacion, dia FROM sim_evaluaciones WHERE tecnico_id = ? ORDER BY id',
    )
    .all(tecnicoId);
  const porSistema = SISTEMAS.map(({ id, nombre, grupo }) => {
    const de = (m) => evals.filter((e) => e.sistema === id && e.momento === m).map((e) => e.calificacion);
    const finales = de('final');
    const diferidas = de('diferida');
    const final = finales.length ? Math.max(...finales) : null;
    const diferida = diferidas.length ? diferidas.at(-1) : null;
    return {
      id,
      nombre,
      grupo,
      inicial: de('inicial').at(-1) ?? null,
      final,
      diferida,
      orden: de('orden').length ? Math.max(...de('orden')) : null,
      acreditado: final != null && final >= APROBACION,
    };
  });

  // IEF: dominio (promedio de finales) y retención (diferida ÷ final, tope 100 %).
  const conFinal = porSistema.filter((s) => s.final != null);
  const dominio = promedio(conFinal.map((s) => s.final / 100));
  const conDiferida = conFinal.filter((s) => s.diferida != null);
  const retencion = promedio(conDiferida.map((s) => Math.min(1, s.diferida / s.final)));
  const ief = dominio != null && retencion != null ? dominio * 0.6 + retencion * 0.4 : null;

  // ICO: precisión y autonomía con las acciones de práctica (sin contar las filas de "ayuda").
  const acciones = db
    .prepare(
      `SELECT actividad, intento, resultado, con_ayuda, paso, pieza, herramienta, detalle, sistema
       FROM sim_acciones WHERE tecnico_id = ? ORDER BY id`,
    )
    .all(tecnicoId);
  // Solo cuenta la práctica (Encuéntralo, órdenes de taller y práctica libre): Conoce es la fase
  // guiada de aprendizaje y Comprueba ya es la evaluación del IEF.
  const intentos = acciones.filter(
    (a) => a.resultado !== 'ayuda' && ['encuentra', 'orden', 'libre'].includes(a.actividad),
  );
  const correctas = intentos.filter((a) => a.resultado === 'correcta');
  const precision = intentos.length ? correctas.length / intentos.length : null;
  const autonomia = correctas.length ? correctas.filter((a) => !a.con_ayuda).length / correctas.length : null;
  const ico = precision != null && autonomia != null ? precision * 0.6 + autonomia * 0.4 : null;
  // Reducción de errores y críticos finales, por intento de la orden de taller.
  const ordenes = acciones.filter((a) => a.actividad === 'orden');
  const numIntentos = [...new Set(ordenes.map((a) => a.intento))].sort((a, b) => a - b);
  const erroresDe = (n) =>
    ordenes.filter((a) => a.intento === n && ['error', 'critico'].includes(a.resultado)).length;
  const primeros = numIntentos.length ? erroresDe(numIntentos[0]) : null;
  const ultimos = numIntentos.length ? erroresDe(numIntentos.at(-1)) : null;
  const reduccionErrores = numIntentos.length > 1 && primeros > 0 ? (primeros - ultimos) / primeros : null;
  const criticosFinales = numIntentos.length
    ? ordenes.filter((a) => a.intento === numIntentos.at(-1) && a.resultado === 'critico').length
    : null;
  // Pareto: errores más frecuentes (qué pieza y qué paso).
  const conteo = new Map();
  intentos
    .filter((a) => a.resultado !== 'correcta')
    .forEach((a) => {
      const clave = a.detalle || `${a.paso ?? a.pieza ?? 'acción'} (${a.herramienta ?? 'sin herramienta'})`;
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    });
  const pareto = [...conteo.entries()]
    .map(([error, veces]) => ({ error, veces }))
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 8);

  // IEFI: avance de la ruta y horas efectivas contra la línea base.
  const { segundos, sesiones } = db
    .prepare(
      'SELECT COALESCE(SUM(segundos), 0) AS segundos, COUNT(*) AS sesiones FROM sim_sesiones WHERE tecnico_id = ?',
    )
    .get(tecnicoId);
  const horas = segundos / 3600;
  const acreditados = porSistema.filter((s) => s.acreditado).length;
  const avance = acreditados / SISTEMAS.length;
  const horasBase = acreditados * LINEA_BASE_HORAS;
  const reduccionTiempo = horasBase ? 1 - horas / horasBase : null;
  const cumplimientoTiempo =
    reduccionTiempo == null ? null : Math.max(0, Math.min(1, reduccionTiempo / META_REDUCCION));
  const iefi = cumplimientoTiempo == null ? avance * 0.6 : avance * 0.6 + cumplimientoTiempo * 0.4;

  return {
    ief: {
      valor: pct(ief),
      dominio: pct(dominio),
      retencion: pct(retencion),
      meta: { dominio: APROBACION, retencion: 90, ief: 90 },
      satisfactorio: ief != null && ief >= 0.9 && dominio >= APROBACION / 100 && retencion >= 0.9,
    },
    ico: {
      valor: pct(ico),
      precision: pct(precision),
      autonomia: pct(autonomia),
      reduccionErrores: pct(reduccionErrores),
      criticosFinales,
      acciones: intentos.length,
      meta: { autonomia: 90, reduccionErrores: 30, criticosFinales: 0, ico: 90 },
      satisfactorio:
        ico != null &&
        ico >= 0.9 &&
        autonomia >= 0.9 &&
        criticosFinales === 0 &&
        (reduccionErrores ?? 0) >= 0.3,
    },
    iefi: {
      valor: pct(iefi),
      avance: pct(avance),
      acreditados,
      programados: SISTEMAS.length,
      horas: Math.round(horas * 100) / 100,
      sesiones,
      horasBase,
      reduccionTiempo: pct(reduccionTiempo),
      horasAhorradas: horasBase ? Math.round((horasBase - horas) * 10) / 10 : null,
      meta: { avance: 100, reduccionTiempo: 20, iefi: 100 },
      satisfactorio: avance === 1 && (reduccionTiempo ?? 0) >= META_REDUCCION,
    },
    sistemas: porSistema,
    pareto,
  };
}

/** Bitácora cronológica (para la lista de cotejo y el reporte). */
export function bitacora(tecnicoId, limite = 200) {
  return db
    .prepare(
      `SELECT sistema, actividad, intento, pieza, herramienta, paso, resultado, con_ayuda AS conAyuda, detalle, creado_en AS cuando
       FROM sim_acciones WHERE tecnico_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(tecnicoId, limite);
}

export function obtenerSimulador(tecnicoId) {
  tecnicoOError(tecnicoId);
  const progreso = Object.fromEntries(
    db
      .prepare('SELECT sistema, datos FROM sim_progreso WHERE tecnico_id = ?')
      .all(tecnicoId)
      .map((f) => [f.sistema, JSON.parse(f.datos)]),
  );
  const { sesiones, segundos } = db
    .prepare(
      'SELECT COUNT(*) AS sesiones, COALESCE(SUM(segundos), 0) AS segundos FROM sim_sesiones WHERE tecnico_id = ?',
    )
    .get(tecnicoId);
  return { progreso, sesiones, segundos, indices: calcularIndices(tecnicoId) };
}

// ---------- Panel de Volvo: la red completa ----------

const promedioDe = (filas, clave) => {
  const xs = filas.map((f) => f[clave]).filter((x) => x != null);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
};

function resumenGrupo(filas) {
  return {
    tecnicos: filas.length,
    ief: promedioDe(filas, 'ief'),
    ico: promedioDe(filas, 'ico'),
    iefi: promedioDe(filas, 'iefi'),
    dominio: promedioDe(filas, 'dominio'),
    retencion: promedioDe(filas, 'retencion'),
    autonomia: promedioDe(filas, 'autonomia'),
    acreditados: filas.reduce((a, f) => a + f.acreditados, 0),
    horas: Math.round(filas.reduce((a, f) => a + f.horas, 0) * 10) / 10,
    criticosFinales: filas.reduce((a, f) => a + (f.criticosFinales ?? 0), 0),
  };
}

/** IEF, ICO e IEFI de cada técnico con práctica, por taller y por experiencia; Pareto de la red. */
export function indicesRed() {
  const tecnicos = db.prepare('SELECT id, nombre, taller, experiencia FROM tecnicos ORDER BY nombre').all();
  const conPractica = new Set(
    db
      .prepare(
        'SELECT DISTINCT tecnico_id AS id FROM sim_acciones UNION SELECT DISTINCT tecnico_id FROM sim_evaluaciones',
      )
      .all()
      .map((f) => f.id),
  );
  const filas = tecnicos
    .filter((t) => conPractica.has(t.id))
    .map((t) => {
      const i = calcularIndices(t.id);
      return {
        ...t,
        ief: i.ief.valor,
        ico: i.ico.valor,
        iefi: i.iefi.valor,
        dominio: i.ief.dominio,
        retencion: i.ief.retencion,
        precision: i.ico.precision,
        autonomia: i.ico.autonomia,
        criticosFinales: i.ico.criticosFinales,
        acreditados: i.iefi.acreditados,
        horas: i.iefi.horas,
        satisfactorio: { ief: i.ief.satisfactorio, ico: i.ico.satisfactorio, iefi: i.iefi.satisfactorio },
      };
    });
  const agrupar = (clave) => {
    const grupos = new Map();
    filas.forEach((f) => grupos.set(f[clave], [...(grupos.get(f[clave]) ?? []), f]));
    return [...grupos.entries()].map(([nombre, grupo]) => ({ nombre, ...resumenGrupo(grupo) }));
  };
  const pareto = db
    .prepare(
      `SELECT COALESCE(detalle, pieza, 'acción') AS error, COUNT(*) AS veces,
              SUM(resultado = 'critico') AS criticos, COUNT(DISTINCT tecnico_id) AS tecnicos
       FROM sim_acciones
       WHERE resultado IN ('error', 'critico') AND actividad IN ('encuentra', 'orden', 'libre')
       GROUP BY 1 ORDER BY veces DESC LIMIT 8`,
    )
    .all();
  const criticos = db
    .prepare(
      `SELECT a.detalle, a.sistema, a.creado_en AS cuando, t.nombre, t.taller
       FROM sim_acciones a JOIN tecnicos t ON t.id = a.tecnico_id
       WHERE a.resultado = 'critico' ORDER BY a.id DESC LIMIT 6`,
    )
    .all();
  return {
    red: resumenGrupo(filas),
    porExperiencia: agrupar('experiencia'),
    porTaller: agrupar('taller').sort((a, b) => (b.ief ?? 0) - (a.ief ?? 0)),
    tecnicos: filas,
    pareto,
    criticos,
    metas: { ief: 90, ico: 90, iefi: 100, aprobacion: APROBACION },
    lineaBaseHoras: LINEA_BASE_HORAS,
  };
}
