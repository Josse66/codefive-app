import { obtenerTecnico } from '#services/tecnicos.service.js';
import { obtenerPlan } from '#services/plan.service.js';
import { asegurarDominio, obtenerPerfil } from '#services/dominio.service.js';
import { obtenerRuta } from '#services/ruta.service.js';
import { RECUADROS, estadoGrupo } from '#helpers/lamina.js';
import { nombreGrupo } from '#helpers/formato.js';
import { empezarComoPrincipiante, obtenerCarrera, yaEmpezo } from '#services/carrera.service.js';
import { modeloDelTecnico } from '#services/modelos.service.js';

function conTecnico(req, res, render) {
  const tecnico = obtenerTecnico(req.params.id);
  if (!tecnico) {
    res.status(404).render('404', { titulo: 'No encontrado', ruta: req.originalUrl });
    return;
  }
  render(tecnico);
}

// Flujo de entrada del técnico, una pantalla a la vez y sin menú:
// ¿Cómo empiezas? → diagnóstico (o principiante) → resultados → Mi plan.
export function mostrarEmpezar(req, res) {
  conTecnico(req, res, (tecnico) => {
    const { escalones } = obtenerCarrera(tecnico.id);
    res.render('empezar', {
      layout: 'enfoque',
      titulo: '¿Cómo empiezas?',
      pasoFlujo: 'Paso 1 de 3 · Cómo empiezas',
      tecnico,
      modelo: modeloDelTecnico(tecnico),
      escalones,
    });
  });
}

export function empezarPrincipiante(req, res) {
  conTecnico(req, res, (tecnico) => {
    empezarComoPrincipiante(tecnico.id);
    res.redirect(`/tecnicos/${tecnico.id}/resultados`);
  });
}

export function mostrarResultados(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('resultados', {
      layout: 'enfoque',
      titulo: `Tu punto de partida · ${tecnico.nombre}`,
      pasoFlujo: 'Paso 3 de 3 · Tu punto de partida',
      tecnico,
      carrera: obtenerCarrera(tecnico.id),
    }),
  );
}

export function mostrarDiagnostico(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('diagnostico', {
      layout: 'enfoque',
      titulo: `Diagnóstico · ${tecnico.nombre}`,
      pasoFlujo: 'Paso 2 de 3 · Diagnóstico',
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
    res.render('ruta', { titulo: `Ruta · ${tecnico.nombre}`, tecnico, seccion: 'plan', siguiente, despues });
  });
}

export function mostrarPractica(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('practica', {
      titulo: `Práctica · ${tecnico.nombre}`,
      tecnico,
      seccion: 'plan',
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
      seccion: 'plan',
      competenciaId: req.params.competenciaId,
      scriptPagina: 'pages/evaluacion.js',
    }),
  );
}

// Tablero de Volvo: no depende de un técnico; los datos llegan por la API y se actualizan en vivo.
export function mostrarTablero(_req, res) {
  res.render('tablero', {
    titulo: 'Tablero Volvo',
    seccion: 'tablero',
    scriptPagina: 'pages/tablero.js',
  });
}

// Autobús en 3D por grupos de función, del tipo de la tecnología del técnico.
export function mostrarAutobus(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('autobus', {
      titulo: `Autobús · ${tecnico.nombre}`,
      tecnico,
      seccion: 'autobus',
      autobus: tecnico.tecnologia === 'electrica' ? 'electrico' : 'diesel',
      scriptPagina: 'pages/autobus.js',
    }),
  );
}

// Escenario de práctica en pantalla dividida: hipótesis a la izquierda, autobús 3D a la derecha.
export function mostrarEscenario(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('escenario', {
      titulo: `Escenario · ${tecnico.nombre}`,
      tecnico,
      seccion: 'autobus',
      escenarioId: req.params.escenarioId,
      scriptPagina: 'pages/escenario.js',
    }),
  );
}

// Modo Taller: bahía de órdenes, nivel y experiencia del técnico.
export function mostrarTaller(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('taller', {
      titulo: `Taller · ${tecnico.nombre}`,
      tecnico,
      seccion: 'taller',
      scriptPagina: 'pages/taller.js',
    }),
  );
}

// Orden de trabajo en curso: el mismo escenario en pantalla dividida, con reloj y entrega.
export function mostrarOrden(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('escenario', {
      titulo: `Orden de trabajo · ${tecnico.nombre}`,
      tecnico,
      seccion: 'taller',
      ordenId: req.params.ordenId,
      scriptPagina: 'pages/escenario.js',
    }),
  );
}

// Modo Aprender: temario por grupo de función y nivel.
export function mostrarTemario(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('aprender', {
      titulo: `Aprender · ${tecnico.nombre}`,
      tecnico,
      seccion: 'plan',
      scriptPagina: 'pages/aprender.js',
    }),
  );
}

// Lección con el autobús 3D al lado.
export function mostrarLeccion(req, res) {
  conTecnico(req, res, (tecnico) =>
    res.render('leccion', {
      titulo: `Lección · ${tecnico.nombre}`,
      tecnico,
      seccion: 'plan',
      leccionId: req.params.leccionId,
      scriptPagina: 'pages/leccion.js',
    }),
  );
}

// Mi plan de formación: la página de inicio de cada técnico.
export function mostrarPlan(req, res) {
  conTecnico(req, res, (tecnico) => {
    // Un técnico que todavía no decide cómo empezar va primero a esa pantalla.
    if (req.cuenta?.rol === 'tecnico' && !yaEmpezo(tecnico)) {
      res.redirect(`/tecnicos/${tecnico.id}/empezar`);
      return;
    }
    res.render('plan', {
      titulo: `Mi plan · ${tecnico.nombre}`,
      tecnico,
      seccion: 'plan',
      plan: obtenerPlan(tecnico.id),
      carrera: obtenerCarrera(tecnico.id),
    });
  });
}
