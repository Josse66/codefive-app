import db from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';
import { nombreGrupo } from '#helpers/formato.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { asegurarDominio, obtenerPerfil } from '#services/dominio.service.js';
import { aplicaAlModelo, modeloDelTecnico } from '#services/modelos.service.js';

// Plan de carrera del técnico, de principiante a experto, con los niveles que usa Volvo
// (mentoría, foto_24): Nivel 1 Básico → Nivel 2 Medio (diseño y función) → Nivel 3 Avanzado
// (diagnóstico y reparación). El nivel es por grupo de función, no global.
// Experto = nivel 3 en los 9 grupos que aplican a su autobús.

export const NIVELES = [
  {
    nivel: 1,
    nombre: 'Básico',
    enfoque: 'Seguridad, operación e inspección',
    texto: 'Reconoce los sistemas, trabaja seguro y hace la inspección y el mantenimiento de rutina.',
  },
  {
    nivel: 2,
    nombre: 'Medio',
    enfoque: 'Diseño y función',
    texto: 'Entiende cómo funciona cada sistema y por qué falla; interpreta códigos y diagramas.',
  },
  {
    nivel: 3,
    nombre: 'Avanzado',
    enfoque: 'Diagnóstico y reparación',
    texto: 'Localiza la causa raíz con método, repara bien a la primera y verifica la reparación.',
  },
];

// Horas estimadas de estudio y práctica por competencia según su nivel (estimación del prototipo).
const HORAS_POR_NIVEL = { 1: 1.5, 2: 2.5, 3: 4 };

export function diagnosticado(tecnicoId) {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM eventos WHERE tecnico_id = ? AND fase = 'diagnostico'")
      .get(tecnicoId).n > 0
  );
}

/** Ya eligió cómo empezar: hizo el diagnóstico o empezó como principiante. */
export function yaEmpezo(tecnico) {
  return Boolean(tecnico.inicio) || diagnosticado(tecnico.id);
}

/**
 * Empieza como principiante: sin diagnóstico, todo su plan arranca desde el nivel 1.
 * Lo que ya haya practicado o evaluado se respeta.
 */
export function empezarComoPrincipiante(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  asegurarDominio(tecnico);
  db.prepare("UPDATE tecnicos SET inicio = 'principiante' WHERE id = ?").run(tecnicoId);
  db.prepare('UPDATE dominio SET p_saber = 0.1 WHERE tecnico_id = ? AND intentos = 0').run(tecnicoId);
}

export function marcarInicioDiagnostico(tecnicoId) {
  db.prepare("UPDATE tecnicos SET inicio = 'diagnostico' WHERE id = ?").run(tecnicoId);
}

function estadoNivel(competencias) {
  if (competencias.length === 0) return 'sin_contenido';
  if (competencias.every((c) => c.estado === 'dominada')) return 'dominado';
  if (competencias.some((c) => c.estado !== 'brecha')) return 'en_curso';
  return 'pendiente';
}

/** Mapa completo: 9 grupos × 3 niveles, nivel de cada grupo, nivel global y lo que falta para experto. */
export function obtenerCarrera(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  asegurarDominio(tecnico);
  const modelo = modeloDelTecnico(tecnico);
  const perfil = obtenerPerfil(tecnico.id);
  const conAlerta = new Set(perfil.alertas.map((a) => a.competenciaId));
  const competencias = perfil.competencias
    .filter((c) => aplicaAlModelo(c.tecnologia, modelo))
    .map((c) => ({ ...c, alerta: conAlerta.has(c.id), dominio: Math.round(c.pSaber * 100) }));

  const grupos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((grupo) => {
    const delGrupo = competencias.filter((c) => c.grupo === grupo);
    const niveles = NIVELES.map(({ nivel, nombre }) => {
      const delNivel = delGrupo.filter((c) => c.nivel === nivel);
      return { nivel, nombre, estado: estadoNivel(delNivel), competencias: delNivel };
    });
    // Nivel alcanzado: el más alto con todo dominado, sin saltar niveles (los vacíos no cuentan).
    let alcanzado = 0;
    niveles.every((n) => {
      if (n.estado === 'sin_contenido') return true;
      if (n.estado !== 'dominado') return false;
      alcanzado = n.nivel;
      return true;
    });
    return {
      grupo,
      nombre: nombreGrupo(grupo),
      niveles,
      alcanzado,
      nombreAlcanzado: alcanzado ? NIVELES[alcanzado - 1].nombre : 'Por empezar',
      dominadas: delGrupo.filter((c) => c.estado === 'dominada').length,
      total: delGrupo.length,
    };
  });

  const conContenido = grupos.filter((g) => g.total > 0);
  // Nivel global: el que tiene cumplido en todos sus grupos.
  const nivelGlobal = conContenido.length ? Math.min(...conContenido.map((g) => g.alcanzado)) : 0;
  const total = competencias.length;
  const dominadas = competencias.filter((c) => c.estado === 'dominada');
  const pendientes = competencias.filter((c) => c.estado !== 'dominada');

  const escalones = [
    {
      clave: 'principiante',
      nombre: 'Principiante',
      enfoque: 'Punto de partida',
      texto: 'Recién llegas al autobús: el plan empieza por la seguridad y la inspección.',
    },
    ...NIVELES.map((n) => ({ clave: `nivel-${n.nivel}`, ...n })),
    {
      clave: 'experto',
      nombre: 'Experto',
      enfoque: 'Los 9 grupos en avanzado',
      texto: `Diagnostica y repara todos los sistemas de ${modelo.nombre} y puede enseñar a otros.`,
    },
  ].map((escalon, i) => {
    // i = 0 principiante, 1..3 niveles, 4 experto
    const delNivel = i >= 1 && i <= 3 ? competencias.filter((c) => c.nivel === i) : [];
    return {
      ...escalon,
      total: delNivel.length,
      dominadas: delNivel.filter((c) => c.estado === 'dominada').length,
      logrado: i === 0 || (i <= 3 && nivelGlobal >= i) || (i === 4 && nivelGlobal >= 3),
      actual: i === nivelGlobal + 1 || (nivelGlobal >= 3 && i === 4),
    };
  });

  return {
    tecnico,
    modelo,
    inicio: tecnico.inicio ?? (diagnosticado(tecnico.id) ? 'diagnostico' : null),
    grupos,
    escalones,
    nivelGlobal,
    nombreNivelGlobal: nivelGlobal ? NIVELES[nivelGlobal - 1].nombre : 'Principiante',
    total,
    dominadas: dominadas.length,
    avanceExperto: total ? Math.round((dominadas.length / total) * 100) : 0,
    horasRestantes: Math.round(pendientes.reduce((s, c) => s + HORAS_POR_NIVEL[c.nivel], 0)),
    resumen: {
      dominadas: dominadas.map((c) => c.nombre),
      enDesarrollo: competencias.filter((c) => c.estado === 'en_desarrollo').map((c) => c.nombre),
      brechas: competencias.filter((c) => c.estado === 'brecha').map((c) => c.nombre),
      seguridad: pendientes.filter((c) => c.critica).map((c) => c.nombre),
      alertas: competencias.filter((c) => c.alerta).map((c) => c.nombre),
    },
  };
}
