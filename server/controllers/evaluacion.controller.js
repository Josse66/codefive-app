import { obtenerEvaluacion, responderEvaluacion, simularDias } from '#services/evaluacion.service.js';

export function obtener(req, res) {
  res.json(obtenerEvaluacion(req.params.id, req.params.competenciaId));
}

export function responder(req, res) {
  const { momento, respuestas } = req.body;
  res.status(201).json(responderEvaluacion(req.params.id, req.params.competenciaId, { momento, respuestas }));
}

export function simular(req, res) {
  res.json(simularDias(req.params.id, req.body?.dias ?? undefined));
}
