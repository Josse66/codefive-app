import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import logger from '#config/logger.js';

// SQLite integrado en Node (sin dependencias). Un solo archivo; funciona sin internet.
export const rutaBaseDatos = process.env.DB_PATH ?? path.resolve('server', 'db', 'codefive.sqlite');

const db = new DatabaseSync(rutaBaseDatos);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
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
