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
