import { iniciarDiagnostico, responderDiagnostico } from '#services/diagnostico.service.js';
import { obtenerPerfil } from '#services/dominio.service.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';

export function iniciar(req, res) {
  res.status(201).json(iniciarDiagnostico(req.body.tecnicoId));
}

export function responder(req, res) {
  const { preguntaId, opcion, confianza, ms, inputDevice } = req.body;
  res.json(
    responderDiagnostico(req.params.sesionId, {
      preguntaId,
      opcion,
      confianza: Number(confianza),
      ms: Number(ms),
      inputDevice,
    }),
  );
}

export function perfil(req, res) {
  if (!obtenerTecnico(req.params.id)) {
    res.status(404).json({ error: 'Técnico no encontrado' });
    return;
  }
  res.json(obtenerPerfil(req.params.id));
}
