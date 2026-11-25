import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import db from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';
import { nuevaCredencial } from '#db/semilla.js';
import { abrirSesion, cifrar } from '#services/cuentas.service.js';

// Entrar con gafete + PIN (como en los hospitales y en planta: equipos compartidos, muchos
// trabajadores, sin listas ni contraseñas largas). El gafete trae un QR con su código.
//   1. Se escanea el gafete → la app sabe quién es y qué experiencia tiene.
//   2. Se teclea el PIN de 4 dígitos → se abre la sesión (y se cierra la del anterior en ese equipo).
// Si lo olvida, el responsable del taller lo restablece (es capacitación, no un sistema crítico).

const INTENTOS_MAX = 5;
const BLOQUEO_MS = 60_000;
const fallos = new Map(); // credencial → { veces, hasta }

const normalizar = (codigo) =>
  String(codigo ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

function porCredencial(codigo) {
  const tecnico = db
    .prepare('SELECT id, nombre, taller, experiencia, pin_hash FROM tecnicos WHERE credencial = ?')
    .get(normalizar(codigo));
  if (!tecnico) throw errorHttp(404, 'No reconocemos ese gafete. Pide ayuda al responsable de tu taller.');
  return tecnico;
}

/** Quién es el dueño del gafete (sin abrir sesión). */
export function leerGafete(codigo) {
  const { id, nombre, taller, experiencia } = porCredencial(codigo);
  return { tecnicoId: id, nombre, taller, experiencia };
}

function pinCorrecto(pin, guardado) {
  if (!guardado) return false;
  const [, sal, hash] = guardado.split('$');
  return timingSafeEqual(scryptSync(String(pin), sal, 64), Buffer.from(hash, 'hex'));
}

// La sesión se abre con la cuenta del técnico; si no tiene (alta desde el taller), se crea una.
function cuentaDe(tecnico) {
  const cuenta = db
    .prepare("SELECT id FROM cuentas WHERE tecnico_id = ? AND rol = 'tecnico'")
    .get(tecnico.id);
  if (cuenta) return cuenta.id;
  const { lastInsertRowid } = db
    .prepare("INSERT INTO cuentas (correo, nombre, rol, tecnico_id, hash) VALUES (?, ?, 'tecnico', ?, ?)")
    .run(
      `${tecnico.id.toLowerCase()}@gafete.local`,
      tecnico.nombre,
      tecnico.id,
      cifrar(randomBytes(24).toString('hex')),
    );
  return Number(lastInsertRowid);
}

/** Gafete + PIN → sesión. Tras 5 fallos seguidos, ese gafete espera 1 minuto. */
export function entrarConGafete(codigo, pin) {
  const clave = normalizar(codigo);
  const registro = fallos.get(clave);
  if (registro && registro.hasta > Date.now()) {
    throw errorHttp(429, 'Demasiados intentos. Espera un minuto o pide ayuda al responsable de tu taller.');
  }
  const tecnico = porCredencial(clave);
  if (!/^\d{4}$/.test(String(pin ?? '')) || !pinCorrecto(pin, tecnico.pin_hash)) {
    const veces = (registro?.veces ?? 0) + 1;
    fallos.set(clave, { veces, hasta: veces >= INTENTOS_MAX ? Date.now() + BLOQUEO_MS : 0 });
    const error = errorHttp(401, 'Ese PIN no coincide.');
    error.restantes = Math.max(0, INTENTOS_MAX - veces);
    throw error;
  }
  fallos.delete(clave);
  return { ...abrirSesion(cuentaDe(tecnico)), tecnicoId: tecnico.id };
}

// ---------- Responsable del taller (rol Volvo en la demo) ----------

export function listarGafetes() {
  return db
    .prepare(
      'SELECT id, nombre, taller, anios_experiencia AS anios, experiencia, credencial FROM tecnicos ORDER BY taller, nombre',
    )
    .all();
}

/** Cambia el PIN y/o la experiencia de un técnico; con nuevoGafete=true le da otro código. */
export function actualizarGafete(tecnicoId, { pin, experiencia, nuevoGafete } = {}) {
  const tecnico = db.prepare('SELECT id FROM tecnicos WHERE id = ?').get(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  if (pin != null && pin !== '') {
    if (!/^\d{4}$/.test(String(pin))) throw errorHttp(400, 'El PIN son 4 números');
    db.prepare('UPDATE tecnicos SET pin_hash = ? WHERE id = ?').run(cifrar(String(pin)), tecnicoId);
  }
  if (experiencia != null) {
    if (!['general', 'mayor'].includes(experiencia)) throw errorHttp(400, 'Experiencia inválida');
    db.prepare('UPDATE tecnicos SET experiencia = ? WHERE id = ?').run(experiencia, tecnicoId);
  }
  if (nuevoGafete)
    db.prepare('UPDATE tecnicos SET credencial = ? WHERE id = ?').run(nuevaCredencial(), tecnicoId);
  [...fallos.keys()].forEach((k) => fallos.delete(k));
  return listarGafetes().find((t) => t.id === tecnicoId);
}
