import fs from 'node:fs';
import path from 'node:path';
import db from '#db/conexion.js';
import { nombreGrupo } from '#helpers/formato.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { listarEscenarios } from '#services/escenarios.js';
import { aplicaAlModelo, modeloDelTecnico } from '#services/modelos.service.js';

// Misión: el mismo ciclo de 4 pasos para cada competencia del plan, siempre con un solo botón principal.
//   1. ¿Qué sabes?  evaluación "antes" (3 preguntas, sin ayuda)
//   2. Aprende      la lección sobre el autobús 3D
//   3. Hazlo        el escenario en el autobús (o práctica guiada si la competencia no tiene escenario)
//   4. Comprueba    evaluación "después"; aprueba con 91 como los cursos de Volvo
// La evaluación diferida llega después como "Repaso", a los 7 días simulados.

const temario = JSON.parse(fs.readFileSync(path.resolve('data', 'temario.json'), 'utf8'));
const leccionDe = new Map(temario.map((l) => [l.competencia, l]));
export const competenciaDeLeccion = (leccionId) =>
  temario.find((l) => l.id === leccionId)?.competencia ?? null;

/** Escenario donde se practica la competencia en el autobús del técnico (como competencia principal o de un paso). */
export function escenarioDeCompetencia(competenciaId, modelo) {
  const aplica = listarEscenarios().filter((e) => !e.tecnologia || aplicaAlModelo(e.tecnologia, modelo));
  return (
    aplica.find((e) => e.competencia === competenciaId) ??
    aplica.find((e) => e.pasos?.some((p) => p.competencia === competenciaId)) ??
    null
  );
}

const momento = (tecnicoId, competenciaId, cual) =>
  db
    .prepare('SELECT id FROM evaluaciones WHERE tecnico_id = ? AND competencia_id = ? AND fase = ? LIMIT 1')
    .get(tecnicoId, competenciaId, cual);

export function obtenerMision(tecnicoId, competenciaId) {
  const tecnico = obtenerTecnico(tecnicoId);
  const competencia = db.prepare('SELECT * FROM competencias WHERE id = ?').get(competenciaId);
  if (!tecnico || !competencia) return null;
  const modelo = modeloDelTecnico(tecnico);
  const leccion = leccionDe.get(competenciaId);
  const escenario = escenarioDeCompetencia(competenciaId, modelo);
  const base = `/tecnicos/${tecnico.id}`;
  const mision = `?mision=${competenciaId}`;

  const hizoAntes = Boolean(momento(tecnico.id, competenciaId, 'pre'));
  const leyo = leccion
    ? Boolean(
        db
          .prepare('SELECT 1 FROM lecciones_vistas WHERE tecnico_id = ? AND leccion_id = ?')
          .get(tecnico.id, leccion.id),
      )
    : true;
  const practico =
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM eventos WHERE tecnico_id = ? AND competencia_id = ? AND fase = 'practica'",
      )
      .get(tecnico.id, competenciaId).n > 0;
  const comprobo = Boolean(momento(tecnico.id, competenciaId, 'post'));

  const pasos = [
    {
      clave: 'antes',
      nombre: '¿Qué sabes?',
      texto: '2 preguntas rápidas antes de empezar, para medir cuánto aprendes.',
      hecho: hizoAntes,
      enlace: `${base}/evaluacion/${competenciaId}${mision}`,
    },
    {
      clave: 'aprende',
      nombre: 'Aprende',
      texto: 'Lo esencial en tarjetas cortas sobre el autobús.',
      hecho: leyo,
      enlace: leccion ? `${base}/aprender/${leccion.id}${mision}` : null,
    },
    {
      clave: 'hazlo',
      nombre: 'Hazlo',
      texto: escenario ? `En el autobús: ${escenario.titulo}.` : 'Práctica guiada con ayuda paso a paso.',
      hecho: practico,
      enlace: escenario
        ? `${base}/escenario/${escenario.id}${mision}`
        : `${base}/practica/${competenciaId}${mision}`,
    },
    {
      clave: 'comprueba',
      nombre: 'Comprueba',
      texto: 'Preguntas sin ayuda para ver cuánto aprendiste. Apruebas con 91, como en los cursos de Volvo.',
      hecho: comprobo,
      enlace: `${base}/evaluacion/${competenciaId}${mision}`,
    },
  ].filter((p) => p.enlace);

  const actual = pasos.find((p) => !p.hecho) ?? null;
  pasos.forEach((p) => Object.assign(p, { actual: p === actual }));
  return {
    competencia: {
      id: competencia.id,
      nombre: competencia.nombre,
      grupo: competencia.grupo,
      nombreGrupo: nombreGrupo(competencia.grupo),
      nivel: competencia.nivel,
      critica: competencia.critica === 1,
    },
    pasos,
    actual,
    terminada: !actual,
    plan: `${base}/plan`,
  };
}

/** Siguiente paso de la misión después de `clave` (para el botón "Siguiente" de cada página). */
export function pasoDespues(mision, clave) {
  if (!mision) return null;
  const i = mision.pasos.findIndex((p) => p.clave === clave);
  return mision.pasos.slice(i + 1).find((p) => !p.hecho) ?? null;
}
