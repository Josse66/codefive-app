import db from '#db/conexion.js';
import { UMBRALES } from '#services/modelo.js';

export function listarTecnicos() {
  return db.prepare('SELECT * FROM tecnicos ORDER BY id').all();
}

export function obtenerTecnico(id) {
  return db.prepare('SELECT * FROM tecnicos WHERE id = ?').get(id) ?? null;
}

// Técnicos con su avance: si ya hicieron el diagnóstico y cuántas competencias dominan.
export function listarTecnicosConAvance() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM competencias').get().n;
  return db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM eventos e WHERE e.tecnico_id = t.id AND e.fase = 'diagnostico') > 0 AS diagnosticado,
        (SELECT COUNT(*) FROM dominio d WHERE d.tecnico_id = t.id AND d.p_saber >= ?) AS dominadas
       FROM tecnicos t ORDER BY t.id`,
    )
    .all(UMBRALES.dominada)
    .map((t) => ({ ...t, diagnosticado: t.diagnosticado === 1, total }));
}
