import db from '#db/conexion.js';
import { cuadranteConfianza, estadoDominio, priorInicial } from '#services/modelo.js';

export function listarCompetencias() {
  return db.prepare('SELECT * FROM competencias ORDER BY tecnologia, grupo, nivel, id').all();
}

// Crea el punto de partida del modelo para cada competencia que el técnico aún no tenga.
export function asegurarDominio(tecnico) {
  const insertar = db.prepare(`
    INSERT OR IGNORE INTO dominio (tecnico_id, competencia_id, p_saber) VALUES (?, ?, ?)`);
  listarCompetencias().forEach((c) => insertar.run(tecnico.id, c.id, priorInicial(tecnico, c)));
}

export function obtenerDominio(tecnicoId, competenciaId) {
  return db
    .prepare('SELECT * FROM dominio WHERE tecnico_id = ? AND competencia_id = ?')
    .get(tecnicoId, competenciaId);
}

export function guardarDominio(tecnicoId, competenciaId, cambios) {
  const actual = obtenerDominio(tecnicoId, competenciaId);
  const fila = { ...actual, ...cambios };
  db.prepare(
    `UPDATE dominio SET p_saber = ?, estabilidad = ?, intentos = ?, aciertos = ?, ultima_practica = ?
     WHERE tecnico_id = ? AND competencia_id = ?`,
  ).run(
    fila.p_saber,
    fila.estabilidad,
    fila.intentos,
    fila.aciertos,
    fila.ultima_practica,
    tecnicoId,
    competenciaId,
  );
}

// Perfil de competencias: dominio por competencia, resumen por área y alertas de confianza.
export function obtenerPerfil(tecnicoId) {
  const filas = db
    .prepare(
      `SELECT c.*, d.p_saber, d.intentos, d.aciertos, d.ultima_practica
       FROM competencias c JOIN dominio d ON d.competencia_id = c.id
       WHERE d.tecnico_id = ?
       ORDER BY c.tecnologia, c.grupo, c.nivel, c.id`,
    )
    .all(tecnicoId);

  const competencias = filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    tecnologia: f.tecnologia,
    grupo: f.grupo,
    nivel: f.nivel,
    habilidad: f.habilidad,
    critica: f.critica === 1,
    pSaber: Math.round(f.p_saber * 100) / 100,
    estado: estadoDominio(f.p_saber),
    evaluada: f.intentos > 0,
  }));

  // Nivel del área = el más alto en el que todas sus competencias están dominadas, sin saltar niveles.
  const areas = {};
  competencias.forEach((c) => {
    const clave = `${c.tecnologia}-${c.grupo}`;
    areas[clave] ??= { clave, tecnologia: c.tecnologia, grupo: c.grupo, competencias: [] };
    areas[clave].competencias.push(c);
  });
  const resumen = Object.values(areas).map((area) => {
    let nivel = 0;
    [1, 2, 3].every((n) => {
      const delNivel = area.competencias.filter((c) => c.nivel === n);
      if (delNivel.length === 0) return true;
      if (!delNivel.every((c) => c.estado === 'dominada')) return false;
      nivel = n;
      return true;
    });
    return { ...area, nivelAlcanzado: nivel };
  });

  const alertas = db
    .prepare(
      `SELECT e.competencia_id, e.correcta, e.confianza, c.nombre, c.critica
       FROM eventos e JOIN competencias c ON c.id = e.competencia_id
       WHERE e.tecnico_id = ? AND e.tipo = 'respuesta' AND e.confianza IS NOT NULL
       ORDER BY e.id DESC`,
    )
    .all(tecnicoId)
    .filter((e) => cuadranteConfianza(e.correcta === 1, e.confianza) === 'seguro_equivocado')
    .map((e) => ({ competenciaId: e.competencia_id, nombre: e.nombre, critica: e.critica === 1 }));
  const alertasUnicas = [...new Map(alertas.map((a) => [a.competenciaId, a])).values()];

  return { tecnicoId, competencias, areas: resumen, alertas: alertasUnicas };
}
