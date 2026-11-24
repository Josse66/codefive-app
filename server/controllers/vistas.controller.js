import { obtenerTecnico } from '#services/tecnicos.service.js';
import { asegurarDominio, obtenerPerfil } from '#services/dominio.service.js';
import { obtenerRuta } from '#services/ruta.service.js';

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

// Mapa de competencias: una fila por área (tecnología + grupo) y una columna por nivel.
export function mostrarPerfil(req, res) {
  conTecnico(req, res, (tecnico) => {
    asegurarDominio(tecnico);
    const perfil = obtenerPerfil(tecnico.id);
    const filas = perfil.areas.map((area) => ({
      ...area,
      niveles: [1, 2, 3].map((nivel) => ({
        nivel,
        competencias: area.competencias.filter((c) => c.nivel === nivel),
      })),
    }));
    const conteo = (estado) => perfil.competencias.filter((c) => c.estado === estado).length;
    res.render('perfil', {
      titulo: `Perfil · ${tecnico.nombre}`,
      tecnico,
      filas,
      alertas: perfil.alertas,
      evaluado: perfil.competencias.some((c) => c.evaluada),
      resumen: {
        dominadas: conteo('dominada'),
        enDesarrollo: conteo('en_desarrollo'),
        brechas: conteo('brecha'),
      },
    });
  });
}

export function mostrarRuta(req, res) {
  conTecnico(req, res, (tecnico) => {
    const { pasos } = obtenerRuta(tecnico.id);
    res.render('ruta', { titulo: `Ruta · ${tecnico.nombre}`, tecnico, pasos });
  });
}
