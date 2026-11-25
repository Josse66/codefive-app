import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import logger from '#config/logger.js';
import { transaccion } from '#db/conexion.js';
import { cifrar, crearCuenta } from '#services/cuentas.service.js';

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

// Cuentas y códigos de registro de la demostración (data/cuentas.json). No duplica.
export function sembrarCuentas(db) {
  const { contrasenaDemo, codigosRegistro, cuentas } = leerJson('cuentas.json');
  const insertarCodigo = db.prepare(
    'INSERT OR IGNORE INTO codigos_registro (codigo, organizacion) VALUES (?, ?)',
  );
  codigosRegistro.forEach((c) => insertarCodigo.run(c.codigo, c.organizacion));
  const existe = db.prepare('SELECT 1 FROM cuentas WHERE correo = ?');
  const hayTecnico = db.prepare('SELECT 1 FROM tecnicos WHERE id = ?');
  cuentas
    .filter((c) => !existe.get(c.correo) && (!c.tecnico || hayTecnico.get(c.tecnico)))
    .forEach((c) =>
      crearCuenta({
        correo: c.correo,
        nombre: c.nombre,
        rol: c.rol,
        tecnicoId: c.tecnico,
        contrasena: contrasenaDemo,
      }),
    );
}

// Código legible del gafete (también se puede teclear si la cámara falla): CF- + 6 caracteres sin
// letras que se confunden (sin O, 0, I, 1).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function nuevaCredencial() {
  return `CF-${Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')}`;
}

// Gafetes de demostración: a cada técnico sin gafete se le da código, el PIN de prueba de
// data/cuentas.json y la experiencia de data/tecnicos.json. No toca los que ya tienen.
export function sembrarGafetes(db) {
  const { pinDemo } = leerJson('cuentas.json');
  const experiencias = Object.fromEntries(leerJson('tecnicos.json').map((t) => [t.id, t.experiencia]));
  const sinGafete = db.prepare('SELECT id FROM tecnicos WHERE credencial IS NULL').all();
  const poner = db.prepare(
    'UPDATE tecnicos SET credencial = ?, pin_hash = ?, experiencia = COALESCE(?, experiencia) WHERE id = ?',
  );
  sinGafete.forEach(({ id }) => poner.run(nuevaCredencial(), cifrar(pinDemo), experiencias[id] ?? null, id));
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
    // El autobús de cada técnico de la demo, sin pisar el que ya haya elegido.
    const ponerModelo = db.prepare('UPDATE tecnicos SET modelo_id = ? WHERE id = ? AND modelo_id IS NULL');
    tecnicos.filter((t) => t.modelo_id).forEach((t) => ponerModelo.run(t.modelo_id, t.id));
  });

  logger.info(
    `Semilla cargada: ${competencias.length} competencias, ${preguntas.length} preguntas, ${tecnicos.length} técnicos`,
  );
}
