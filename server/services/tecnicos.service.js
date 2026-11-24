import db from '#db/conexion.js';

export function listarTecnicos() {
  return db.prepare('SELECT * FROM tecnicos ORDER BY id').all();
}

export function obtenerTecnico(id) {
  return db.prepare('SELECT * FROM tecnicos WHERE id = ?').get(id) ?? null;
}
