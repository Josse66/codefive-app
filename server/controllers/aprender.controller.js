import { marcarVista, obtenerLeccion, obtenerTemario } from '#services/aprender.service.js';

export function temario(req, res) {
  res.json(obtenerTemario(req.params.id));
}

export function leccion(req, res) {
  res.json(obtenerLeccion(req.params.id, req.params.leccionId));
}

export function vista(req, res) {
  res.json(marcarVista(req.params.id, req.params.leccionId));
}
