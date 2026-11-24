import { errorHttp } from '#helpers/errores.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { modeloDelTecnico } from '#services/modelos.service.js';
import { registrarEvento } from '#services/eventos.service.js';
import { asegurarDominio, guardarDominio, obtenerDominio, obtenerPerfil } from '#services/dominio.service.js';
import { actualizarBKT, estadoDominio } from '#services/modelo.js';
import { modoDeAyuda } from '#services/ruta.js';
import {
  competenciaDelPaso,
  evaluarIntento,
  listarEscenarios,
  obtenerEscenario,
  paraCliente,
  progresoInicial,
} from '#services/escenarios.js';

// Práctica con escenario: el técnico formula hipótesis y ejecuta acciones en la escena 3D.
// Cada intento llega como evento educativo (POST /api/eventos); el servidor lo califica con las
// reglas del escenario, lo guarda en la bitácora, actualiza el dominio y avisa al tablero.
// El avance vive en memoria: un escenario dura minutos y la evidencia ya queda en la base.
const sesiones = new Map();
const clave = (tecnicoId, escenarioId) => `${tecnicoId}|${escenarioId}`;

// Acertar después de pedir pista es evidencia más débil.
const ADIVINAR_CON_PISTA = 0.5;

function validar(tecnicoId, escenarioId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  const escenario = obtenerEscenario(escenarioId);
  if (!escenario) throw errorHttp(404, 'Escenario no encontrado');
  asegurarDominio(tecnico);
  return { tecnico, escenario };
}

// El autobús del escenario; si sirve para ambos, el de la tecnología del técnico.
// El autobús del escenario; si sirve para ambos, el del modelo que atiende el técnico.
const autobusDe = (escenario, tecnico) => escenario.autobus ?? modeloDelTecnico(tecnico).autobus;

export function iniciarEscenario(tecnicoId, escenarioId) {
  const { tecnico, escenario } = validar(tecnicoId, escenarioId);
  const progreso = progresoInicial();
  sesiones.set(clave(tecnicoId, escenarioId), progreso);
  const { p_saber: pSaber } = obtenerDominio(tecnico.id, escenario.competencia);
  const modo = modoDeAyuda(pSaber);
  const cliente = paraCliente(escenario);
  return {
    tecnico: { id: tecnico.id, nombre: tecnico.nombre, tecnologia: tecnico.tecnologia },
    escenario: {
      ...cliente,
      // En modo autónomo no hay pistas: tiene que resolverlo solo.
      pasos: cliente.pasos.map((p) => ({ ...p, pista: modo === 'autonomo' ? null : p.pista })),
    },
    autobus: autobusDe(escenario, tecnico),
    modo,
    pSaber,
    progreso,
  };
}

export function registrarIntento({ tecnicoId, escenarioId, pasoId, accion, opcion, pista, inputDevice, ms }) {
  const { tecnico, escenario } = validar(tecnicoId, escenarioId);
  const llave = clave(tecnicoId, escenarioId);
  if (!sesiones.has(llave)) sesiones.set(llave, progresoInicial());
  const progreso = sesiones.get(llave);

  const resultado = evaluarIntento(escenario, progreso, { pasoId, accion, opcion });
  if (resultado.invalido) throw errorHttp(409, resultado.invalido);

  const paso = escenario.pasos[progreso.paso];
  const competenciaId = competenciaDelPaso(escenario, paso);
  registrarEvento({
    tecnico_id: tecnico.id,
    tipo: 'accion',
    fase: 'practica',
    competencia_id: competenciaId,
    escenario_id: escenario.id,
    paso_id: paso.id,
    accion: accion ?? `opcion:${opcion}`,
    correcta: resultado.correcta,
    critico: resultado.error?.critico ?? false,
    pista: Boolean(pista),
    codigo_error: resultado.error?.codigo ?? null,
    input_device: inputDevice ?? 'mouse',
    ms: Number.isFinite(Number(ms)) ? Math.round(Number(ms)) : null,
  });

  // El dominio se mueve al completar un paso o al equivocarse; los subpasos intermedios no cuentan.
  const dominio = obtenerDominio(tecnico.id, competenciaId);
  let pSaber = dominio.p_saber;
  if (resultado.completaPaso || !resultado.correcta) {
    pSaber = actualizarBKT(
      dominio.p_saber,
      resultado.correcta,
      pista ? { adivinar: ADIVINAR_CON_PISTA } : {},
    );
    guardarDominio(tecnico.id, competenciaId, {
      p_saber: pSaber,
      intentos: dominio.intentos + 1,
      aciertos: dominio.aciertos + (resultado.correcta ? 1 : 0),
      ultima_practica: new Date().toISOString(),
    });
  }
  sesiones.set(llave, resultado.progreso);

  return {
    correcta: resultado.correcta,
    completaPaso: resultado.completaPaso,
    terminado: resultado.terminado,
    error: resultado.error,
    explicacion: resultado.explicacion,
    efecto: resultado.efecto,
    progreso: resultado.progreso,
    dominio: {
      competenciaId,
      antes: dominio.p_saber,
      despues: pSaber,
      estado: estadoDominio(pSaber),
      modo: modoDeAyuda(pSaber),
    },
  };
}

/** Los 9 escenarios con el estado del técnico en su competencia, para el autobús por grupos. */
export function escenariosDelTecnico(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  asegurarDominio(tecnico);
  const competencias = new Map(obtenerPerfil(tecnicoId).competencias.map((c) => [c.id, c]));
  return listarEscenarios().map((e) => {
    const competencia = competencias.get(e.competencia);
    return {
      id: e.id,
      grupo: e.grupo,
      titulo: e.titulo,
      sintoma: e.sintoma,
      tecnologia: e.tecnologia,
      profundidad: e.profundidad,
      competencia: {
        id: e.competencia,
        nombre: competencia?.nombre,
        pSaber: competencia?.pSaber ?? 0,
        estado: competencia?.estado ?? 'brecha',
      },
    };
  });
}
