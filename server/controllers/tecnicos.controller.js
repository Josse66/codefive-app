import { listarTecnicos, obtenerTecnico } from '#services/tecnicos.service.js';

export function listar(_req, res) {
  res.json(listarTecnicos());
}

export function obtener(req, res) {
  const tecnico = obtenerTecnico(req.params.id);
  if (!tecnico) {
    res.status(404).json({ error: 'Técnico no encontrado' });
    return;
  }
  res.json(tecnico);
}
