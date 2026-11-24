import db, { transaccion } from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';
import { avisar } from '#config/envivo.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { aplicaAlModelo, modeloDelTecnico } from '#services/modelos.service.js';
import { asegurarDominio, obtenerPerfil } from '#services/dominio.service.js';
import { obtenerRuta } from '#services/ruta.service.js';
import { listarEscenarios, obtenerEscenario } from '#services/escenarios.js';
import { iniciarEscenario, registrarIntento } from '#services/escenarios.service.js';
import {
  MINUTOS_LIMITE,
  NIVELES,
  XP_BASE,
  calificarOrden,
  desbloqueado,
  nivelPorDominio,
  nivelPorXp,
  progresoNivel,
  reputacion,
} from '#services/taller.js';

// Modo Taller: la bahía del técnico recibe órdenes de trabajo elegidas por el motor adaptativo
// (primero seguridad, luego brechas, después escenarios nuevos y repasos), las atiende en el
// autobús 3D y al entregarlas gana experiencia y reputación.

const LUGARES_BAHIA = 3;
// Clientes y unidades ficticios para la demostración.
const CLIENTES = [
  'Transportes del Bajío',
  'Flota Urbana Metropolitana',
  'Autobuses del Golfo',
  'Línea Express del Norte',
  'Turismo Sierra Madre',
  'Ruta Peninsular',
];

function validarTecnico(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  asegurarDominio(tecnico);
  return tecnico;
}

// El autobús del escenario; si sirve para ambos, el del modelo que atiende el técnico.
const autobusDe = (escenario, tecnico) => escenario.autobus ?? modeloDelTecnico(tecnico).autobus;

function nivelDelTecnico(tecnicoId) {
  const { xp: ganada } = db
    .prepare("SELECT COALESCE(SUM(xp), 0) AS xp FROM ordenes WHERE tecnico_id = ? AND estado = 'entregada'")
    .get(tecnicoId);
  const { competencias } = obtenerPerfil(tecnicoId);
  const proporcion = competencias.length
    ? competencias.filter((c) => c.estado === 'dominada').length / competencias.length
    : 0;
  // El diagnóstico ubica al técnico al inicio de su nivel; cada orden entregada suma desde ahí.
  const xp = NIVELES[nivelPorDominio(proporcion)].xp + ganada;
  return { xp, indice: nivelPorXp(xp) };
}

function paraCliente(orden, tecnico) {
  const escenario = obtenerEscenario(orden.escenario_id);
  return {
    id: orden.id,
    folio: `OT-${String(orden.id).padStart(4, '0')}`,
    motivo: orden.motivo,
    cliente: orden.cliente,
    unidad: orden.unidad,
    estado: orden.estado,
    escenario: {
      id: escenario.id,
      titulo: escenario.titulo,
      sintoma: escenario.sintoma,
      grupo: escenario.grupo,
      nivel: escenario.nivel,
      competencia: escenario.competencia,
      profundidad: escenario.profundidad,
      autobus: autobusDe(escenario, tecnico),
    },
    xpBase: XP_BASE[escenario.nivel],
    minutosLimite: MINUTOS_LIMITE[escenario.nivel],
    estrellas: orden.estrellas,
    xp: orden.xp,
    errores: orden.errores,
    criticos: orden.criticos,
    gasto: orden.gasto,
    segundos: orden.segundos,
    entregadaEn: orden.entregada_en,
  };
}

// Llena la bahía con las órdenes que más le sirven al técnico ahora.
function llenarBahia(tecnico, indiceNivel) {
  const abiertas = db
    .prepare("SELECT * FROM ordenes WHERE tecnico_id = ? AND estado != 'entregada'")
    .all(tecnico.id);
  const faltan = LUGARES_BAHIA - abiertas.length;
  if (faltan <= 0) return;

  const ocupados = new Set(abiertas.map((o) => o.escenario_id));
  const hechas = new Map(
    db
      .prepare(
        "SELECT escenario_id, COUNT(*) AS n FROM ordenes WHERE tecnico_id = ? AND estado = 'entregada' GROUP BY escenario_id",
      )
      .all(tecnico.id)
      .map((f) => [f.escenario_id, f.n]),
  );
  const { pasos } = obtenerRuta(tecnico.id);
  const lugarEnRuta = new Map(
    pasos.map((p, i) => [p.competencia.id, { orden: i, obligatoria: p.obligatoria }]),
  );

  const candidatos = listarEscenarios()
    .filter(
      (e) =>
        desbloqueado(e.nivel, indiceNivel) &&
        !ocupados.has(e.id) &&
        aplicaAlModelo(e.tecnologia, modeloDelTecnico(tecnico)),
    )
    .map((e) => {
      const competencias = [e.competencia, ...e.pasos.map((p) => p.competencia).filter(Boolean)];
      const enRuta = competencias.map((c) => lugarEnRuta.get(c)).filter(Boolean);
      const mejor = enRuta.sort((a, b) => a.orden - b.orden)[0];
      let motivo = 'repaso';
      let prioridad = 200 + (hechas.get(e.id) ?? 0) * 10;
      if (mejor?.obligatoria) {
        motivo = 'seguridad';
        prioridad = mejor.orden;
      } else if (mejor) {
        motivo = 'brecha';
        prioridad = 50 + mejor.orden;
      } else if (!hechas.has(e.id)) {
        motivo = 'nueva';
        prioridad = 150 + e.grupo;
      }
      return { escenario: e, motivo, prioridad };
    })
    .sort((a, b) => a.prioridad - b.prioridad)
    .slice(0, faltan);

  const insertar = db.prepare(
    'INSERT INTO ordenes (tecnico_id, escenario_id, motivo, cliente, unidad) VALUES (?, ?, ?, ?, ?)',
  );
  candidatos.forEach(({ escenario, motivo }) => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM ordenes').get();
    const cliente = CLIENTES[n % CLIENTES.length];
    const tipo =
      autobusDe(escenario, tecnico) === 'electrico' ? 'Urbano eléctrico 12 m' : 'Foráneo diésel 13 m';
    insertar.run(
      tecnico.id,
      escenario.id,
      motivo,
      cliente,
      `${tipo} · económico ${String(101 + ((n * 37) % 899))}`,
    );
  });
}

/** Nivel, experiencia, órdenes entregadas y reputación del técnico (para el panel de Volvo). */
export function resumenTaller(tecnicoId) {
  const { xp, indice } = nivelDelTecnico(tecnicoId);
  const estrellas = db
    .prepare("SELECT estrellas FROM ordenes WHERE tecnico_id = ? AND estado = 'entregada' ORDER BY id DESC")
    .all(tecnicoId)
    .map((o) => o.estrellas);
  return {
    nivel: NIVELES[indice].nombre,
    xp,
    entregadas: estrellas.length,
    reputacion: reputacion(estrellas),
  };
}

export function obtenerTaller(tecnicoId) {
  const tecnico = validarTecnico(tecnicoId);
  const { xp, indice } = nivelDelTecnico(tecnico.id);
  llenarBahia(tecnico, indice);

  const ordenes = db.prepare('SELECT * FROM ordenes WHERE tecnico_id = ? ORDER BY id DESC').all(tecnico.id);
  const entregadas = ordenes.filter((o) => o.estado === 'entregada');
  const bahia = ordenes
    .filter((o) => o.estado !== 'entregada')
    .reverse()
    .map((o) => paraCliente(o, tecnico));
  const bloqueados = listarEscenarios()
    .filter((e) => !desbloqueado(e.nivel, indice) && aplicaAlModelo(e.tecnologia, modeloDelTecnico(tecnico)))
    .map((e) => ({
      grupo: e.grupo,
      titulo: e.titulo,
      nivelRequerido: NIVELES[e.nivel - 1].nombre,
    }));

  return {
    tecnico: { id: tecnico.id, nombre: tecnico.nombre, taller: tecnico.taller },
    nivel: progresoNivel(xp, indice),
    reputacion: reputacion(entregadas.map((o) => o.estrellas)),
    entregadas: entregadas.length,
    bahia,
    bloqueados,
    historial: entregadas.slice(0, 8).map((o) => paraCliente(o, tecnico)),
  };
}

function ordenDe(tecnicoId, ordenId) {
  const orden = db.prepare('SELECT * FROM ordenes WHERE id = ? AND tecnico_id = ?').get(ordenId, tecnicoId);
  if (!orden) throw errorHttp(404, 'Orden de trabajo no encontrada');
  return orden;
}

export function iniciarOrden(tecnicoId, ordenId) {
  const tecnico = validarTecnico(tecnicoId);
  const orden = ordenDe(tecnico.id, ordenId);
  if (orden.estado === 'entregada') throw errorHttp(409, 'Esta orden ya se entregó');
  // Empezar de nuevo reinicia el reloj y los contadores: la orden se califica completa.
  db.prepare(
    `UPDATE ordenes SET estado = 'en_proceso', iniciada_en = datetime('now'),
       errores = 0, criticos = 0, pistas = 0, gasto = 0, gasto_necesario = 0 WHERE id = ?`,
  ).run(orden.id);
  return {
    orden: paraCliente({ ...orden, estado: 'en_proceso' }, tecnico),
    ...iniciarEscenario(tecnico.id, orden.escenario_id),
  };
}

function entregar(ordenId, tecnicoId) {
  const antes = nivelDelTecnico(tecnicoId);
  const orden = db
    .prepare(
      `SELECT *, CAST((julianday('now') - julianday(iniciada_en)) * 86400 AS INTEGER) AS transcurrido
       FROM ordenes WHERE id = ?`,
    )
    .get(ordenId);
  const escenario = obtenerEscenario(orden.escenario_id);
  const calificacion = calificarOrden({
    nivel: escenario.nivel,
    errores: orden.errores,
    criticos: orden.criticos,
    pistas: orden.pistas,
    segundos: orden.transcurrido,
    gasto: orden.gasto,
    gastoNecesario: orden.gasto_necesario,
  });
  db.prepare(
    `UPDATE ordenes SET estado = 'entregada', entregada_en = datetime('now'), segundos = ?,
       estrellas = ?, xp = ? WHERE id = ?`,
  ).run(orden.transcurrido, calificacion.estrellas, calificacion.xp, ordenId);
  const despues = nivelDelTecnico(tecnicoId);
  avisar('orden', { tecnicoId, ordenId, estrellas: calificacion.estrellas, xp: calificacion.xp });
  return {
    ...calificacion,
    segundos: orden.transcurrido,
    minutosLimite: MINUTOS_LIMITE[escenario.nivel],
    gasto: orden.gasto,
    gastoNecesario: orden.gasto_necesario,
    errores: orden.errores,
    criticos: orden.criticos,
    nivelAntes: progresoNivel(antes.xp, antes.indice),
    nivelDespues: progresoNivel(despues.xp, despues.indice),
    subioNivel: despues.indice > antes.indice,
  };
}

/** Intento dentro de una orden: lo califica el motor de escenarios y se suma a la orden. */
export function intentoEnOrden(intento) {
  const orden = ordenDe(intento.tecnicoId, intento.ordenId);
  if (orden.estado !== 'en_proceso') throw errorHttp(409, 'La orden no está en proceso');
  if (orden.escenario_id !== intento.escenarioId) throw errorHttp(400, 'El escenario no es el de la orden');

  const resultado = registrarIntento(intento);
  const paso = obtenerEscenario(orden.escenario_id).pasos.find((p) => p.id === intento.pasoId);
  const costo =
    paso?.tipo === 'reemplazo' ? (paso.opciones.find((o) => o.id === intento.opcion)?.costo ?? 0) : 0;
  const costoCorrecto =
    paso?.tipo === 'reemplazo' && resultado.completaPaso
      ? (paso.opciones.find((o) => o.id === paso.correcta)?.costo ?? 0)
      : 0;

  return transaccion(() => {
    db.prepare(
      `UPDATE ordenes SET errores = errores + ?, criticos = criticos + ?, pistas = pistas + ?,
         gasto = gasto + ?, gasto_necesario = gasto_necesario + ? WHERE id = ?`,
    ).run(
      !resultado.correcta && !resultado.error?.critico ? 1 : 0,
      resultado.error?.critico ? 1 : 0,
      resultado.completaPaso && intento.pista ? 1 : 0,
      costo,
      costoCorrecto,
      orden.id,
    );
    if (!resultado.terminado) return { ...resultado, gasto: orden.gasto + costo };
    return { ...resultado, entrega: entregar(orden.id, intento.tecnicoId) };
  });
}
