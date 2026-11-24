import { iniciarOrden, obtenerTaller } from '#services/taller.service.js';

export function obtener(req, res) {
  res.json(obtenerTaller(req.params.id));
}

export function iniciar(req, res) {
  res.json(iniciarOrden(req.params.id, Number(req.params.ordenId)));
}
