import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import logger from '#config/logger.js';

// SQLite integrado en Node (sin dependencias). Un solo archivo; funciona sin internet.
export const rutaBaseDatos = process.env.DB_PATH ?? path.resolve('server', 'db', 'codefive.sqlite');

const db = new DatabaseSync(rutaBaseDatos);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
// Migración: las bases creadas antes del banco de evaluación no tienen la columna `banco`.
// Va antes del esquema porque el esquema ya no la agrega a una tabla existente.
const tablaPreguntas = db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'preguntas'")
  .get();
if (
  tablaPreguntas &&
  !db
    .prepare('PRAGMA table_info(preguntas)')
    .all()
    .some((c) => c.name === 'banco')
) {
  db.exec("ALTER TABLE preguntas ADD COLUMN banco TEXT NOT NULL DEFAULT 'practica'");
}
db.exec(fs.readFileSync(path.resolve('server', 'db', 'schema.sql'), 'utf8'));
// Migración: Volvo usa los grupos de función FG 0 a FG 9; las bases viejas solo aceptaban 1 a 9.
// SQLite no cambia un CHECK en su lugar: se recrea la tabla con los mismos datos.
const sqlCompetencias = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'competencias'")
  .get()?.sql;
if (sqlCompetencias?.includes('BETWEEN 1 AND 9')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`BEGIN;
    ${sqlCompetencias.replace('CREATE TABLE competencias', 'CREATE TABLE competencias_fg').replace('BETWEEN 1 AND 9', 'BETWEEN 0 AND 9')};
    INSERT INTO competencias_fg SELECT * FROM competencias;
    DROP TABLE competencias;
    ALTER TABLE competencias_fg RENAME TO competencias;
    COMMIT;`);
  db.exec('PRAGMA foreign_keys = ON');
}
if (
  !db
    .prepare('PRAGMA table_info(tecnicos)')
    .all()
    .some((c) => c.name === 'modelo_id')
) {
  db.exec('ALTER TABLE tecnicos ADD COLUMN modelo_id TEXT');
}
// Cómo empezó el técnico su plan: 'diagnostico' o 'principiante' (null = todavía no elige).
if (
  !db
    .prepare('PRAGMA table_info(tecnicos)')
    .all()
    .some((c) => c.name === 'inicio')
) {
  db.exec('ALTER TABLE tecnicos ADD COLUMN inicio TEXT');
}
// Entrar con gafete: código del gafete (QR), PIN cifrado y experiencia ('general' o 'mayor').
const columnasTecnico = db
  .prepare('PRAGMA table_info(tecnicos)')
  .all()
  .map((c) => c.name);
if (!columnasTecnico.includes('credencial')) db.exec('ALTER TABLE tecnicos ADD COLUMN credencial TEXT');
if (!columnasTecnico.includes('pin_hash')) db.exec('ALTER TABLE tecnicos ADD COLUMN pin_hash TEXT');
if (!columnasTecnico.includes('experiencia')) {
  db.exec("ALTER TABLE tecnicos ADD COLUMN experiencia TEXT NOT NULL DEFAULT 'general'");
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tecnicos_credencial ON tecnicos (credencial)');
// Entrena tus manos agrega la actividad 'manos' a la bitácora. SQLite no deja cambiar un CHECK:
// se rehace la tabla con el esquema nuevo y se copian las acciones que ya había.
const sqlAcciones = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'sim_acciones'").get()?.sql ?? '';
if (sqlAcciones && !sqlAcciones.includes("'manos'")) {
  db.exec('BEGIN');
  db.exec('ALTER TABLE sim_acciones RENAME TO sim_acciones_vieja');
  db.exec(sqlAcciones.replace("'libre')", "'libre', 'manos')"));
  db.exec('INSERT INTO sim_acciones SELECT * FROM sim_acciones_vieja');
  db.exec('DROP TABLE sim_acciones_vieja');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sim_acciones_tecnico ON sim_acciones (tecnico_id, creado_en)');
  db.exec('COMMIT');
}
logger.debug(`Base de datos lista en ${rutaBaseDatos}`);

// Ejecuta varias operaciones como una sola: si algo falla, no se guarda nada.
export function transaccion(trabajo) {
  db.exec('BEGIN');
  try {
    const resultado = trabajo();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export default db;
