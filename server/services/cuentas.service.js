import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import db, { transaccion } from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';

// Cuentas, sesiones y registro con código de empresa. Sin dependencias: scrypt de Node para las
// contraseñas y un token aleatorio por sesión guardado en la base.
//   rol 'tecnico': ve solo su plan y su avance.
//   rol 'volvo':   supervisor de capacitación; ve el panel y a todos los técnicos.

const HORAS_SESION = 12;

export function cifrar(contrasena) {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(contrasena, sal, 64).toString('hex');
  return `scrypt$${sal}$${hash}`;
}

function coincide(contrasena, guardado) {
  const [, sal, hash] = guardado.split('$');
  const calculado = scryptSync(contrasena, sal, 64);
  return timingSafeEqual(calculado, Buffer.from(hash, 'hex'));
}

const normalizarCorreo = (correo) =>
  String(correo ?? '')
    .trim()
    .toLowerCase();

export function crearCuenta({ correo, nombre, rol, tecnicoId = null, contrasena }) {
  db.prepare('INSERT INTO cuentas (correo, nombre, rol, tecnico_id, hash) VALUES (?, ?, ?, ?, ?)').run(
    normalizarCorreo(correo),
    nombre,
    rol,
    tecnicoId,
    cifrar(contrasena),
  );
}

export function verificar(correo, contrasena) {
  const cuenta = db.prepare('SELECT * FROM cuentas WHERE correo = ?').get(normalizarCorreo(correo));
  // Mismo mensaje si no existe el correo o la contraseña no coincide.
  if (!cuenta || !contrasena || !coincide(String(contrasena), cuenta.hash)) {
    throw errorHttp(401, 'Correo o contraseña incorrectos');
  }
  return cuenta;
}

export function abrirSesion(cuentaId) {
  const token = randomBytes(32).toString('hex');
  db.prepare(
    `INSERT INTO sesiones (token, cuenta_id, expira) VALUES (?, ?, datetime('now', '+${HORAS_SESION} hours'))`,
  ).run(token, cuentaId);
  return { token, segundos: HORAS_SESION * 3600 };
}

export function cuentaDeSesion(token) {
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT c.id, c.correo, c.nombre, c.rol, c.tecnico_id AS tecnicoId
         FROM sesiones s JOIN cuentas c ON c.id = s.cuenta_id
         WHERE s.token = ? AND s.expira > datetime('now')`,
      )
      .get(token) ?? null
  );
}

export function cerrarSesion(token) {
  if (token) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

function siguienteClave() {
  const { maximo } = db
    .prepare("SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) AS maximo FROM tecnicos WHERE id LIKE 'T-%'")
    .get();
  return `T-${String((maximo ?? 0) + 1).padStart(2, '0')}`;
}

/** Registro de un técnico nuevo con el código que le dio su empresa. */
export function registrarTecnico({ codigo, nombre, correo, contrasena, taller, anios }) {
  const errores = {};
  const registro = db.prepare('SELECT * FROM codigos_registro WHERE codigo = ? AND activo = 1').get(
    String(codigo ?? '')
      .trim()
      .toUpperCase(),
  );
  if (!registro) errores.codigo = 'El código no es válido. Pídelo a tu jefe de taller o a Volvo.';
  if (!String(nombre ?? '').trim()) errores.nombre = 'Escribe tu nombre completo.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizarCorreo(correo)))
    errores.correo = 'Escribe un correo válido.';
  else if (db.prepare('SELECT 1 FROM cuentas WHERE correo = ?').get(normalizarCorreo(correo))) {
    errores.correo = 'Ya hay una cuenta con ese correo. Inicia sesión.';
  }
  if (String(contrasena ?? '').length < 8) errores.contrasena = 'Usa al menos 8 caracteres.';
  if (!String(taller ?? '').trim()) errores.taller = 'Elige tu taller.';
  const aniosNumero = Number(anios);
  if (!Number.isInteger(aniosNumero) || aniosNumero < 0 || aniosNumero > 50) {
    errores.anios = 'Escribe tus años de experiencia (0 si eres recién egresado).';
  }
  if (Object.keys(errores).length) {
    const error = errorHttp(400, 'Revisa los datos del registro');
    error.campos = errores;
    throw error;
  }

  return transaccion(() => {
    const id = siguienteClave();
    db.prepare(
      `INSERT INTO tecnicos (id, nombre, taller, anios_experiencia, tecnologia, perfil)
       VALUES (?, ?, ?, ?, 'diesel', 'registrado')`,
    ).run(id, nombre.trim(), taller.trim(), aniosNumero);
    crearCuenta({
      correo,
      nombre: nombre.trim(),
      rol: 'tecnico',
      tecnicoId: id,
      contrasena: String(contrasena),
    });
    return db.prepare('SELECT * FROM cuentas WHERE correo = ?').get(normalizarCorreo(correo));
  });
}
