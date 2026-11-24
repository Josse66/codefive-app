import { cuentaDeSesion } from '#services/cuentas.service.js';

// Sesión por cookie y reglas de acceso:
//   - sin sesión, solo se ve entrar y registro;
//   - un técnico solo entra a sus propias páginas y datos;
//   - el rol volvo ve el panel y a todos los técnicos.

export const COOKIE = 'cf_sesion';

export function leerCookie(req, nombre) {
  const encontrada = (req.headers.cookie ?? '')
    .split(';')
    .map((parte) => parte.trim().split('='))
    .find(([clave]) => clave === nombre);
  return encontrada ? decodeURIComponent(encontrada.slice(1).join('=')) : null;
}

export function escribirCookie(res, valor, segundos) {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${segundos}${seguro}`,
  );
}

export function cargarSesion(req, res, next) {
  req.cuenta = cuentaDeSesion(leerCookie(req, COOKIE));
  res.locals.cuenta = req.cuenta;
  res.locals.esVolvo = req.cuenta?.rol === 'volvo';
  next();
}

const esApi = (req) => req.originalUrl.startsWith('/api/');

function negar(req, res, estado, mensaje) {
  if (esApi(req)) {
    res.status(estado).json({ error: mensaje });
    return;
  }
  if (estado === 401) {
    res.redirect('/entrar');
    return;
  }
  res.redirect('/');
}

export function exigirSesion(req, res, next) {
  if (!req.cuenta) {
    negar(req, res, 401, 'Inicia sesión');
    return;
  }
  next();
}

export function exigirVolvo(req, res, next) {
  if (!req.cuenta) {
    negar(req, res, 401, 'Inicia sesión');
    return;
  }
  if (req.cuenta.rol !== 'volvo') {
    negar(req, res, 403, 'Solo el equipo de capacitación de Volvo puede ver esto');
    return;
  }
  next();
}

/** El técnico de la ruta (o del cuerpo de la petición) debe ser el de la sesión, salvo para Volvo. */
export function exigirTecnico(req, res, next) {
  if (!req.cuenta) {
    negar(req, res, 401, 'Inicia sesión');
    return;
  }
  const tecnicoId = req.params.id ?? req.body?.tecnicoId;
  if (req.cuenta.rol === 'volvo' || !tecnicoId || tecnicoId === req.cuenta.tecnicoId) {
    next();
    return;
  }
  negar(req, res, 403, 'Solo puedes ver tu propio avance');
}
