import { iniciarPractica, responderPractica } from '#services/practica.service.js';

export function obtener(req, res) {
  res.json(iniciarPractica(req.params.id, req.params.competenciaId));
}

export function responder(req, res) {
  const { preguntaId, opcion, confianza, pista, ms, inputDevice } = req.body;
  res.json(
    responderPractica(req.params.id, {
      preguntaId,
      opcion,
      confianza: confianza == null ? null : Number(confianza),
      pista: Boolean(pista),
      ms: Number(ms),
      inputDevice,
    }),
  );
}
