import { listarTecnicos } from '#services/tecnicos.service.js';

export function mostrarInicio(_req, res) {
  res.render('inicio', {
    titulo: 'Inicio',
    modulos: ['Diagnóstico de competencias', 'Ruta personalizada', 'Práctica en 3D', 'Tablero Volvo'],
    tecnicos: listarTecnicos(),
  });
}
