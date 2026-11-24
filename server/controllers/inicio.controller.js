import { listarTecnicosConAvance } from '#services/tecnicos.service.js';

export function mostrarInicio(_req, res) {
  res.render('inicio', { titulo: 'Red de técnicos', seccion: 'red', tecnicos: listarTecnicosConAvance() });
}
