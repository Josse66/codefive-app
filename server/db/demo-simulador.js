// Práctica sintética en el simulador del autobús para que el panel de Volvo muestre IEF, ICO e IEFI
// con datos coherentes: sesiones con horas efectivas, bitácora de acciones, Comprueba final y
// diferida a 30 días, y órdenes de taller con errores que bajan de un intento a otro.
// También marca con Experiencia Adulto Mayor a los técnicos sintéticos con más años de oficio.
// Datos sintéticos (se declaran así en la memoria). Uso: npm run db:demo (lo corre al final).
import fs from 'node:fs';
import path from 'node:path';
import db from '#db/conexion.js';
import logger from '#config/logger.js';

const DATOS = JSON.parse(fs.readFileSync(path.resolve('data', 'autobus', 'piezas.json'), 'utf8'));
const SISTEMAS = DATOS.sistemas;
const ORDEN = SISTEMAS.find((s) => s.orden_taller);

// Generador con semilla: sale igual cada vez.
function generador(semilla) {
  let a = semilla;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}
const azar = generador(2511);
const entre = (min, max) => min + azar() * (max - min);

const tecnicos = db
  .prepare(
    "SELECT id, nombre, anios_experiencia AS anios FROM tecnicos WHERE perfil = 'sintetico' ORDER BY id",
  )
  .all();
const yaHay = db
  .prepare(
    'SELECT COUNT(*) AS n FROM sim_acciones a JOIN tecnicos t ON t.id = a.tecnico_id WHERE t.perfil = ?',
  )
  .get('sintetico').n;

if (!tecnicos.length) {
  logger.warn('No hay técnicos sintéticos: corre primero "npm run db:demo".');
} else if (yaHay) {
  logger.warn('La práctica sintética del simulador ya existe.');
} else {
  const sesion = db.prepare(
    "INSERT INTO sim_sesiones (tecnico_id, inicio, ultimo, segundos) VALUES (?, datetime('now', ?), datetime('now', ?), ?)",
  );
  const accion = db.prepare(
    `INSERT INTO sim_acciones (tecnico_id, sistema, actividad, intento, pieza, herramienta, paso, resultado, con_ayuda, detalle, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
  );
  const evaluacion = db.prepare(
    'INSERT INTO sim_evaluaciones (tecnico_id, sistema, momento, calificacion, dia) VALUES (?, ?, ?, ?, ?)',
  );
  const experiencia = db.prepare("UPDATE tecnicos SET experiencia = 'mayor' WHERE id = ?");
  const fichas = DATOS.piezas;

  db.exec('BEGIN');
  tecnicos.forEach((t, n) => {
    // Los de más oficio usan la Experiencia Adulto Mayor; aprenden un poco más lento la
    // interfaz, pero su dominio del oficio es alto (lo que dice la investigación del equipo).
    const mayor = t.anios >= 15;
    if (mayor) experiencia.run(t.id);
    const habilidad = Math.min(0.97, 0.62 + t.anios * 0.012 + entre(-0.06, 0.08));
    const dias = `-${(n % 5) + 1} days`;

    // Sesiones: horas efectivas (los de Adulto Mayor practican sesiones más cortas y más seguidas).
    const numSesiones = mayor ? 6 + Math.floor(entre(0, 3)) : 3 + Math.floor(entre(0, 3));
    for (let s = 0; s < numSesiones; s += 1) {
      const minutos = mayor ? entre(10, 22) : entre(15, 35);
      sesion.run(t.id, `-${numSesiones - s} days`, `-${numSesiones - s} days`, Math.round(minutos * 60));
    }

    // Sistemas que practicó.
    const cuantos = 3 + Math.floor(entre(0, 4));
    const practicados = [...SISTEMAS].sort(() => azar() - 0.5).slice(0, cuantos);
    practicados.forEach((sis) => {
      sis.orden.forEach((base) => {
        const acierta = azar() < habilidad;
        accion.run(
          t.id,
          sis.id,
          'encuentra',
          1,
          base,
          null,
          null,
          acierta ? 'correcta' : 'error',
          0,
          acierta ? null : `Confundió ${fichas[base].nombre}`,
          dias,
        );
        if (!acierta) accion.run(t.id, sis.id, 'encuentra', 1, base, null, null, 'correcta', 1, null, dias);
      });
      const final = Math.round(Math.min(100, entre(78, 92) + habilidad * 10));
      evaluacion.run(t.id, sis.id, 'final', final, 0);
      if (azar() < 0.75) {
        // Retención: los de más oficio retienen más (conocimiento acumulado).
        const caida = entre(0, mayor ? 6 : 12) * (1.2 - habilidad);
        evaluacion.run(t.id, sis.id, 'diferida', Math.max(0, Math.round(final - caida)), 30);
      }
    });

    // Órdenes de taller del motor: los errores bajan entre el primer y el último intento.
    const intentos = 1 + Math.floor(entre(0, 3));
    for (let k = 1; k <= intentos; k += 1) {
      const intento = k;
      const errores = Math.max(0, Math.round((1 - habilidad) * 6 - (k - 1) * 1.5 + entre(-1, 1)));
      const critico = k === 1 ? azar() < 0.35 : azar() < 0.08;
      ORDEN.orden_taller.pasos.forEach((paso, i) => {
        const [herramienta, pieza] = paso.correcta.split('>');
        accion.run(
          t.id,
          ORDEN.id,
          'orden',
          intento,
          pieza,
          herramienta,
          `paso ${i + 1}`,
          'correcta',
          k === 1 && azar() < 0.4 ? 1 : 0,
          null,
          dias,
        );
      });
      for (let e = 0; e < errores; e += 1) {
        const malas = ['turbo', 'multiple_admision', 'inyectores', 'enfriador_aire'];
        const pieza = malas[Math.floor(azar() * malas.length)];
        accion.run(
          t.id,
          ORDEN.id,
          'orden',
          intento,
          pieza,
          null,
          'causa',
          'error',
          0,
          `Cambió ${fichas[pieza].nombre} sin necesidad`,
          dias,
        );
      }
      if (critico) {
        accion.run(
          t.id,
          ORDEN.id,
          'orden',
          intento,
          'filtro_combustible',
          'llave',
          'paso 1',
          'critico',
          0,
          ORDEN.orden_taller.pasos[0].errores['llave>filtro_combustible'].mensaje,
          dias,
        );
      }
      const nota = Math.max(0, 100 - errores * 15 - (critico ? 30 : 0));
      evaluacion.run(t.id, ORDEN.id, 'orden', nota, 0);
    }
  });
  db.exec('COMMIT');
  const total = db.prepare('SELECT COUNT(*) AS n FROM sim_acciones').get().n;
  logger.warn(
    `Práctica del simulador lista: ${tecnicos.length} técnicos sintéticos, ${total} acciones en la bitácora`,
  );
}

db.close();
