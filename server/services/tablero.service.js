import db from '#db/conexion.js';
import { listarCompetencias, obtenerPerfil } from '#services/dominio.service.js';
import { UMBRALES } from '#services/modelo.js';
import { listarEscenarios, obtenerEscenario } from '#services/escenarios.js';
import { resumenTaller } from '#services/taller.service.js';
import { NUMEROS_GRUPO } from '#helpers/formato.js';

// Tablero de capacitación y postventa de Volvo: avance, dominio, errores recurrentes y retención
// de todos los técnicos. Todo sale de la bitácora de eventos, del dominio y de las evaluaciones.

const redondear = (p) => Math.round(p * 100);
const promedio = (valores) =>
  valores.length ? valores.reduce((suma, v) => suma + v, 0) / valores.length : null;

// Último resultado de cada momento por técnico y competencia.
function evaluacionesRecientes() {
  const filas = db
    .prepare(
      `SELECT e.* FROM evaluaciones e
       JOIN (SELECT MAX(id) AS id FROM evaluaciones GROUP BY tecnico_id, competencia_id, fase) u ON u.id = e.id`,
    )
    .all();
  const porClave = new Map();
  filas.forEach((f) => {
    const clave = `${f.tecnico_id}|${f.competencia_id}`;
    if (!porClave.has(clave))
      porClave.set(clave, { tecnicoId: f.tecnico_id, competenciaId: f.competencia_id });
    porClave.get(clave)[f.fase] = f.p_saber;
  });
  return [...porClave.values()];
}

const retencionDe = (e) => (e.post && e.diferida != null ? Math.min(1, e.diferida / e.post) : null);

// Listo para el autobús real: domina todas las competencias críticas de seguridad de su tecnología
// y no tiene alertas de "seguro pero equivocado" en ellas. Regla del prototipo, no criterio oficial.
function preparacion(tecnico, perfil) {
  const conAlerta = new Set(perfil.alertas.map((a) => a.competenciaId));
  const criticas = perfil.competencias.filter(
    (c) => c.critica && (c.tecnologia === 'ambas' || c.tecnologia === tecnico.tecnologia),
  );
  const pendientes = criticas
    .filter((c) => c.estado !== 'dominada' || conAlerta.has(c.id))
    .map((c) => ({ id: c.id, nombre: c.nombre, alerta: conAlerta.has(c.id) }));
  return { listo: criticas.length > 0 && pendientes.length === 0, pendientes };
}

function resumenTecnicos(evaluaciones) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM competencias').get().n;
  return db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM eventos e WHERE e.tecnico_id = t.id AND e.fase = 'diagnostico') AS respuestas_diagnostico,
        (SELECT COUNT(*) FROM eventos e WHERE e.tecnico_id = t.id AND e.critico = 1) AS errores_criticos,
        (SELECT COUNT(*) FROM eventos e WHERE e.tecnico_id = t.id AND e.tipo = 'respuesta') AS respuestas,
        (SELECT MAX(creado_en) FROM eventos e WHERE e.tecnico_id = t.id) AS ultima_actividad
       FROM tecnicos t ORDER BY t.id`,
    )
    .all()
    .map((t) => {
      const diagnosticado = t.respuestas_diagnostico > 0;
      const perfil = obtenerPerfil(t.id);
      const dominadas = perfil.competencias.filter((c) => c.estado === 'dominada').length;
      const retenciones = evaluaciones
        .filter((e) => e.tecnicoId === t.id)
        .map(retencionDe)
        .filter((r) => r != null);
      return {
        id: t.id,
        nombre: t.nombre,
        taller: t.taller,
        tecnologia: t.tecnologia,
        aniosExperiencia: t.anios_experiencia,
        diasSimulados: t.dias_simulados,
        diagnosticado,
        dominadas,
        total,
        dominioPromedio: perfil.competencias.length
          ? redondear(promedio(perfil.competencias.map((c) => c.pSaber)))
          : null,
        respuestas: t.respuestas,
        erroresCriticos: t.errores_criticos,
        alertas: perfil.alertas.length,
        retencion: retenciones.length ? redondear(promedio(retenciones)) : null,
        ultimaActividad: t.ultima_actividad,
        preparacion: diagnosticado ? preparacion(t, perfil) : null,
        progreso: resumenTaller(t.id),
      };
    });
}

// Dominio promedio por competencia entre los técnicos ya diagnosticados.
function dominioPorCompetencia() {
  const filas = db
    .prepare(
      `SELECT d.competencia_id, d.p_saber FROM dominio d
       WHERE d.tecnico_id IN (SELECT DISTINCT tecnico_id FROM eventos WHERE fase = 'diagnostico')`,
    )
    .all();
  return listarCompetencias().map((c) => {
    const valores = filas.filter((f) => f.competencia_id === c.id).map((f) => f.p_saber);
    return {
      id: c.id,
      nombre: c.nombre,
      grupo: c.grupo,
      tecnologia: c.tecnologia,
      critica: c.critica === 1,
      tecnicos: valores.length,
      promedio: valores.length ? redondear(promedio(valores)) : null,
      brechas: valores.filter((p) => p < UMBRALES.enDesarrollo).length,
      dominadas: valores.filter((p) => p >= UMBRALES.dominada).length,
    };
  });
}

// Preguntas que más se fallan: dónde capacitar o revisar el contenido.
function erroresRecurrentes() {
  return db
    .prepare(
      `SELECT e.pregunta_id AS preguntaId, p.enunciado, c.id AS competenciaId, c.nombre AS competencia,
              c.critica, COUNT(*) AS intentos, SUM(e.correcta = 0) AS fallos,
              SUM(e.correcta = 0 AND e.confianza = 3) AS segurosEquivocados,
              COUNT(DISTINCT CASE WHEN e.correcta = 0 THEN e.tecnico_id END) AS tecnicos
       FROM eventos e
       JOIN preguntas p ON p.id = e.pregunta_id
       JOIN competencias c ON c.id = e.competencia_id
       WHERE e.tipo = 'respuesta'
       GROUP BY e.pregunta_id
       HAVING fallos > 0
       ORDER BY fallos DESC, segurosEquivocados DESC, intentos DESC
       LIMIT 6`,
    )
    .all()
    .map((f) => ({ ...f, critica: f.critica === 1 }));
}

// Antes, después y diferida promediados por competencia evaluada.
function retencionPorCompetencia(evaluaciones) {
  const nombres = new Map(listarCompetencias().map((c) => [c.id, c.nombre]));
  const ids = [...new Set(evaluaciones.map((e) => e.competenciaId))].sort();
  return ids.map((id) => {
    const delId = evaluaciones.filter((e) => e.competenciaId === id);
    const momento = (fase) => {
      const valores = delId.map((e) => e[fase]).filter((v) => v != null);
      return valores.length ? redondear(promedio(valores)) : null;
    };
    const retenciones = delId.map(retencionDe).filter((r) => r != null);
    return {
      id,
      nombre: nombres.get(id),
      tecnicos: delId.length,
      pre: momento('pre'),
      post: momento('post'),
      diferida: momento('diferida'),
      retencion: retenciones.length ? redondear(promedio(retenciones)) : null,
    };
  });
}

const FASES = {
  diagnostico: 'Diagnóstico',
  practica: 'Práctica',
  pre: 'Evaluación antes',
  post: 'Evaluación después',
  diferida: 'Revisión diferida',
};

export function actividadReciente(limite = 12) {
  return db
    .prepare(
      `SELECT e.id, e.fase, e.correcta, e.critico, e.confianza, e.pista, e.creado_en AS creadoEn,
              e.escenario_id AS escenarioId, e.codigo_error AS codigoError, e.input_device AS inputDevice,
              t.id AS tecnicoId, t.nombre AS tecnico, c.id AS competenciaId, c.nombre AS competencia
       FROM eventos e
       JOIN tecnicos t ON t.id = e.tecnico_id
       LEFT JOIN competencias c ON c.id = e.competencia_id
       ORDER BY e.id DESC LIMIT ?`,
    )
    .all(limite)
    .map((e) => ({
      ...e,
      correcta: e.correcta === 1,
      critico: e.critico === 1,
      pista: e.pista === 1,
      seguroEquivocado: e.correcta === 0 && e.confianza === 3,
      faseNombre: e.escenarioId
        ? `Taller · ${obtenerEscenario(e.escenarioId)?.titulo ?? e.escenarioId}`
        : (FASES[e.fase] ?? e.fase),
    }));
}

// Mensaje de cada código de error de los escenarios, para explicarlo en el panel.
function catalogoErrores() {
  const catalogo = new Map();
  listarEscenarios().forEach((escenario) =>
    escenario.pasos.forEach((paso) =>
      Object.values(paso.errores ?? {})
        .filter((e) => e.codigo)
        .forEach((e) => {
          // Se queda el primer mensaje de cada código: es el caso típico.
          if (!catalogo.has(e.codigo)) {
            catalogo.set(e.codigo, { ...e, escenario: escenario.titulo, grupo: escenario.grupo });
          }
        }),
    ),
  );
  return catalogo;
}

// Errores en el Taller por código: qué se repite, a cuántos técnicos y en qué talleres.
function erroresEscenarios() {
  const catalogo = catalogoErrores();
  return db
    .prepare(
      `SELECT e.codigo_error AS codigo, COUNT(*) AS veces, COUNT(DISTINCT e.tecnico_id) AS tecnicos,
              GROUP_CONCAT(DISTINCT t.taller) AS talleres, MAX(e.critico) AS critico
       FROM eventos e JOIN tecnicos t ON t.id = e.tecnico_id
       WHERE e.codigo_error IS NOT NULL
       GROUP BY e.codigo_error
       ORDER BY critico DESC, veces DESC
       LIMIT 8`,
    )
    .all()
    .map((f) => ({
      ...f,
      critico: f.critico === 1,
      talleres: f.talleres ? f.talleres.split(',') : [],
      mensaje: catalogo.get(f.codigo)?.mensaje ?? '',
      escenario: catalogo.get(f.codigo)?.escenario ?? '',
      grupo: catalogo.get(f.codigo)?.grupo ?? null,
    }));
}

// Errores por taller: dónde reforzar la capacitación.
function erroresPorTaller() {
  return db
    .prepare(
      `SELECT t.taller, COUNT(DISTINCT t.id) AS tecnicos, COUNT(e.id) AS intentos,
              COALESCE(SUM(e.correcta = 0), 0) AS errores, COALESCE(SUM(e.critico), 0) AS criticos
       FROM tecnicos t LEFT JOIN eventos e ON e.tecnico_id = t.id
       GROUP BY t.taller
       ORDER BY criticos DESC, errores DESC`,
    )
    .all()
    .map((f) => ({ ...f, tasaError: f.intentos ? Math.round((f.errores / f.intentos) * 100) : null }));
}

// Mapa de calor: dominio promedio de cada técnico en cada grupo de función (1 a 9).
function mapaDeCalor() {
  const grupos = NUMEROS_GRUPO;
  const filas = db
    .prepare(
      `SELECT d.tecnico_id, c.grupo, AVG(d.p_saber) AS p
       FROM dominio d JOIN competencias c ON c.id = d.competencia_id
       WHERE d.tecnico_id IN (SELECT DISTINCT tecnico_id FROM eventos)
       GROUP BY d.tecnico_id, c.grupo`,
    )
    .all();
  const tecnicos = db.prepare('SELECT id, nombre, taller FROM tecnicos ORDER BY id').all();
  return {
    grupos,
    filas: tecnicos
      .filter((t) => filas.some((f) => f.tecnico_id === t.id))
      .map((t) => ({
        tecnicoId: t.id,
        nombre: t.nombre,
        taller: t.taller,
        celdas: grupos.map((g) => {
          const fila = filas.find((f) => f.tecnico_id === t.id && f.grupo === g);
          return { grupo: g, p: fila ? redondear(fila.p) : null };
        }),
      })),
  };
}

export function obtenerTablero() {
  const evaluaciones = evaluacionesRecientes();
  const tecnicos = resumenTecnicos(evaluaciones);
  const diagnosticados = tecnicos.filter((t) => t.diagnosticado);
  const retenciones = evaluaciones.map(retencionDe).filter((r) => r != null);
  const ganancias = evaluaciones.filter((e) => e.pre != null && e.post != null).map((e) => e.post - e.pre);

  return {
    generado: new Date().toISOString(),
    indicadores: {
      tecnicos: tecnicos.length,
      diagnosticados: diagnosticados.length,
      listos: diagnosticados.filter((t) => t.preparacion?.listo).length,
      dominioPromedio: diagnosticados.length
        ? Math.round(promedio(diagnosticados.map((t) => t.dominioPromedio)))
        : null,
      alertasSeguridad: diagnosticados.reduce(
        (suma, t) => suma + t.preparacion.pendientes.filter((p) => p.alerta).length,
        0,
      ),
      gananciaPromedio: ganancias.length ? redondear(promedio(ganancias)) : null,
      retencionPromedio: retenciones.length ? redondear(promedio(retenciones)) : null,
      evaluacionesDiferidas: retenciones.length,
    },
    tecnicos,
    competencias: dominioPorCompetencia(),
    errores: erroresRecurrentes(),
    erroresEscenarios: erroresEscenarios(),
    talleres: erroresPorTaller(),
    mapa: mapaDeCalor(),
    retencion: retencionPorCompetencia(evaluaciones),
    actividad: actividadReciente(),
  };
}
