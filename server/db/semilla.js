import fs from 'node:fs';
import path from 'node:path';
import logger from '#config/logger.js';
import { transaccion } from '#db/conexion.js';

// Dificultad inicial (escala Elo) según el nivel Volvo de la competencia.
const DIFICULTAD_POR_NIVEL = { 1: -1, 2: 0, 3: 1 };

const leerJson = (archivo) => JSON.parse(fs.readFileSync(path.resolve('data', archivo), 'utf8'));

// Banco de evaluación (antes y después). Se agrega aunque la base ya exista, sin duplicar.
export function sembrarEvaluacion(db) {
  const nivelDe = Object.fromEntries(
    db
      .prepare('SELECT id, nivel FROM competencias')
      .all()
      .map((c) => [c.id, c.nivel]),
  );
  const insertar = db.prepare(`
    INSERT OR IGNORE INTO preguntas (id, competencia_id, enunciado, opciones, correcta, explicacion, fuente, dificultad, banco)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'evaluacion')`);
  let nuevas = 0;
  transaccion(() => {
    leerJson('evaluacion.json').forEach((p) => {
      const { changes } = insertar.run(
        p.id,
        p.competencia_id,
        p.enunciado,
        JSON.stringify(p.opciones),
        p.correcta,
        p.explicacion,
        p.fuente,
        DIFICULTAD_POR_NIVEL[nivelDe[p.competencia_id]] ?? 0,
      );
      nuevas += Number(changes);
    });
  });
  if (nuevas) logger.info(`Banco de evaluación: ${nuevas} preguntas nuevas`);
}

export function baseVacia(db) {
  return db.prepare('SELECT COUNT(*) AS total FROM competencias').get().total === 0;
}

// Carga competencias, preguntas y técnicos ficticios desde data/. No duplica: se puede correr en cada arranque
// para que las bases existentes reciban el contenido nuevo.
export function sembrar(db) {
  const competencias = leerJson('competencias.json');
  const preguntas = leerJson('preguntas.json');
  const tecnicos = leerJson('tecnicos.json');
  const nivelDe = Object.fromEntries(competencias.map((c) => [c.id, c.nivel]));

  transaccion(() => {
    const insertarCompetencia = db.prepare(`
      INSERT OR IGNORE INTO competencias (id, nombre, tecnologia, grupo, nivel, habilidad, prerequisito, critica)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    // Primero sin prerequisito para no romper la llave foránea; luego se enlazan.
    competencias.forEach((c) =>
      insertarCompetencia.run(
        c.id,
        c.nombre,
        c.tecnologia,
        c.grupo,
        c.nivel,
        c.habilidad,
        null,
        c.critica ? 1 : 0,
      ),
    );
    const enlazar = db.prepare('UPDATE competencias SET prerequisito = ? WHERE id = ?');
    competencias.filter((c) => c.prerequisito).forEach((c) => enlazar.run(c.prerequisito, c.id));

    const insertarPregunta = db.prepare(`
      INSERT OR IGNORE INTO preguntas (id, competencia_id, enunciado, opciones, correcta, explicacion, fuente, dificultad)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    preguntas.forEach((p) =>
      insertarPregunta.run(
        p.id,
        p.competencia_id,
        p.enunciado,
        JSON.stringify(p.opciones),
        p.correcta,
        p.explicacion,
        p.fuente,
        DIFICULTAD_POR_NIVEL[nivelDe[p.competencia_id]] ?? 0,
      ),
    );

    const insertarTecnico = db.prepare(`
      INSERT OR IGNORE INTO tecnicos (id, nombre, taller, anios_experiencia, tecnologia, perfil)
      VALUES (?, ?, ?, ?, ?, ?)`);
    tecnicos.forEach((t) =>
      insertarTecnico.run(t.id, t.nombre, t.taller, t.anios_experiencia, t.tecnologia, t.perfil),
    );
  });

  logger.info(
    `Semilla cargada: ${competencias.length} competencias, ${preguntas.length} preguntas, ${tecnicos.length} técnicos`,
  );
}
