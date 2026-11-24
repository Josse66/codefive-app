import { obtenerTecnico } from '#services/tecnicos.service.js';
import { asegurarDominio, obtenerPerfil } from '#services/dominio.service.js';
import { obtenerRuta } from '#services/ruta.service.js';
import { RECUADROS, estadoGrupo } from '#helpers/lamina.js';
import { nombreGrupo } from '#helpers/formato.js';

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
      seccion: 'diagnostico',
      scriptPagina: 'pages/diagnostico.js',
    }),
  );
}

// Mapa de competencias: la lámina del autobús con un recuadro por grupo de función
// y la tabla de partes del grupo seleccionado.
export function mostrarPerfil(req, res) {
  conTecnico(req, res, (tecnico) => {
    asegurarDominio(tecnico);
    const perfil = obtenerPerfil(tecnico.id);
    const conAlerta = new Set(perfil.alertas.map((a) => a.competenciaId));

    const grupos = Object.entries(RECUADROS).map(([numero, posicion]) => {
      const grupo = Number(numero);
      const competencias = perfil.competencias
        .filter((c) => c.grupo === grupo)
        .map((c) => ({ ...c, alerta: conAlerta.has(c.id) }));
      return {
        numero: grupo,
        nombre: nombreGrupo(grupo),
        estado: estadoGrupo(competencias),
        competencias,
        alertas: competencias.filter((c) => c.alerta),
        siguiente: competencias.find((c) => c.estado !== 'dominada') ?? null,
        ...posicion,
      };
    });

    // Se abre el grupo que más urge: primero alertas de seguridad, luego brechas.
    const seleccionado =
      grupos.find((g) => g.alertas.length) ??
      grupos.find((g) => g.estado === 'brecha') ??
      grupos.find((g) => g.competencias.length);
    grupos.forEach((g) => Object.assign(g, { seleccionado: g === seleccionado }));

    const conteo = (estado) => perfil.competencias.filter((c) => c.estado === estado).length;
    res.render('perfil', {
      titulo: `Competencias · ${tecnico.nombre}`,
      tecnico,
      seccion: 'competencias',
      scriptPagina: 'pages/perfil.js',
      grupos,
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
    const [siguiente, ...despues] = pasos;
    res.render('ruta', { titulo: `Ruta · ${tecnico.nombre}`, tecnico, seccion: 'ruta', siguiente, despues });
  });
}

export function mostrarPractica(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('practica', {
      titulo: `Práctica · ${tecnico.nombre}`,
      tecnico,
      seccion: 'ruta',
      competenciaId: req.params.competenciaId,
      scriptPagina: 'pages/practica.js',
    }),
  );
}

export function mostrarEvaluacion(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('evaluacion', {
      titulo: `Evaluación · ${tecnico.nombre}`,
      tecnico,
      seccion: 'ruta',
      competenciaId: req.params.competenciaId,
      scriptPagina: 'pages/evaluacion.js',
    }),
  );
}
