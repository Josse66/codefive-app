import { listarEscenarios } from '#services/escenarios.js';
import { intentoEnOrden } from '#services/taller.service.js';
import { escenariosDelTecnico, iniciarEscenario, registrarIntento } from '#services/escenarios.service.js';

export function listar(_req, res) {
  res.json(
    listarEscenarios().map(({ id, grupo, titulo, tecnologia, profundidad }) => ({
      id,
      grupo,
      titulo,
      tecnologia,
      profundidad,
    })),
  );
}

export function delTecnico(req, res) {
  res.json(escenariosDelTecnico(req.params.id));
}

export function iniciar(req, res) {
  res.json(iniciarEscenario(req.params.id, req.params.escenarioId));
}

// Evento educativo que manda la escena (contrato de la sección 13 del plan).
export function evento(req, res) {
  const { tecnicoId, escenarioId, pasoId, accion, opcion, pista, inputDevice, ms, ordenId } = req.body;
  // Dentro de una orden de trabajo del Taller, el intento también cuenta para la orden.
  if (ordenId) {
    res.status(201).json(
      intentoEnOrden({
        tecnicoId,
        escenarioId,
        pasoId,
        accion,
        opcion,
        pista,
        inputDevice,
        ms,
        ordenId: Number(ordenId),
      }),
    );
    return;
  }
  res
    .status(201)
    .json(registrarIntento({ tecnicoId, escenarioId, pasoId, accion, opcion, pista, inputDevice, ms }));
}
