import { obtenerTecnico } from '#services/tecnicos.service.js';

function conTecnico(req, res, render) {
  const tecnico = obtenerTecnico(req.params.id);
  if (!tecnico) {
    res.status(404).render('404', { titulo: 'No encontrado', ruta: req.originalUrl });
    return;
  }
  render(tecnico);
}

export function mostrarDiagnostico(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('diagnostico', {
      titulo: `Diagnóstico · ${tecnico.nombre}`,
      tecnico,
      scriptPagina: 'pages/diagnostico.js',
    }),
  );
}
