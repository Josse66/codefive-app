import db from '#db/conexion.js';
import { COOKIE, escribirCookie, leerCookie } from '#helpers/sesion.js';
import { abrirSesion, cerrarSesion, registrarTecnico, verificar } from '#services/cuentas.service.js';
import { elegirModelo, listarModelos, modeloDelTecnico } from '#services/modelos.service.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';

// Talleres de la red Volvo (12 puntos de servicio y talleres integrados) y flotas de clientes.
const TALLERES = [
  'PSV Culiacán',
  'PSV Obregón',
  'PSV San Luis',
  'PSV Guadalajara',
  'PSV Durango',
  'PSV Monterrey',
  'PSV Querétaro',
  'PSV Puebla',
  'PSV Texcoco',
  'PSV Veracruz',
  'PSV Tuxtla',
  'PSV Mérida',
  'WSI Texcoco',
  'Flota cliente Guadalajara',
  'Flota de cliente (otra)',
];

/** A dónde va cada quien al entrar: Volvo al panel; el técnico a elegir autobús, al diagnóstico o a su plan. */
function destino(cuenta) {
  if (cuenta.rol === 'volvo') return '/volvo';
  const tecnico = obtenerTecnico(cuenta.tecnicoId ?? cuenta.tecnico_id);
  if (!tecnico.modelo_id) return '/bienvenida';
  return `/tecnicos/${tecnico.id}/plan`;
}

export function inicio(req, res) {
  if (!req.cuenta) {
    res.redirect('/entrar');
    return;
  }
  res.redirect(destino(req.cuenta));
}

export function mostrarEntrar(req, res) {
  if (req.cuenta) {
    res.redirect(destino(req.cuenta));
    return;
  }
  res.render('entrar', { titulo: 'Entrar', sinMenu: true });
}

export function entrar(req, res) {
  try {
    const cuenta = verificar(req.body.correo, req.body.contrasena);
    const { token, segundos } = abrirSesion(cuenta.id);
    escribirCookie(res, token, segundos);
    res.redirect(destino(cuenta));
  } catch (error) {
    res.status(error.status ?? 500).render('entrar', {
      titulo: 'Entrar',
      sinMenu: true,
      error: error.status === 401 ? error.message : 'No pudimos iniciar tu sesión',
      correo: req.body.correo,
    });
  }
}

export function salir(req, res) {
  cerrarSesion(leerCookie(req, COOKIE));
  escribirCookie(res, '', 0);
  res.redirect('/entrar');
}

export function mostrarRegistro(req, res) {
  res.render('registro', { titulo: 'Registro', sinMenu: true, talleres: TALLERES, datos: {} });
}

export function registrar(req, res) {
  try {
    const cuenta = registrarTecnico(req.body);
    const { token, segundos } = abrirSesion(cuenta.id);
    escribirCookie(res, token, segundos);
    res.redirect('/bienvenida');
  } catch (error) {
    if (error.status !== 400) throw error;
    res.status(400).render('registro', {
      titulo: 'Registro',
      sinMenu: true,
      talleres: TALLERES,
      datos: { ...req.body, contrasena: '' },
      errores: error.campos,
    });
  }
}

// Primer paso de un técnico nuevo (y para cambiar de autobús después): elegir el modelo que atiende.
export function mostrarBienvenida(req, res) {
  if (req.cuenta.rol !== 'tecnico') {
    res.redirect('/volvo');
    return;
  }
  const tecnico = obtenerTecnico(req.cuenta.tecnicoId);
  const actual = tecnico.modelo_id ? modeloDelTecnico(tecnico).id : null;
  // Mismo orden que el catálogo de volvobuses.com/mx: línea y, dentro, Autobuses y Chasises.
  const lineas = ['Autobuses urbanos e interurbanos', 'Autobuses foráneos'].map((linea) => ({
    linea,
    tipos: ['Autobuses', 'Chasises'].map((tipo) => ({
      tipo,
      modelos: listarModelos()
        .filter((m) => m.linea === linea && m.tipo === tipo)
        .map((m) => ({ ...m, elegido: m.id === actual })),
    })),
  }));
  res.render('bienvenida', {
    titulo: 'Elige tu autobús',
    sinMenu: !actual,
    tecnico,
    nuevo: !actual,
    lineas,
    seccion: 'plan',
  });
}

export function guardarBienvenida(req, res) {
  const tecnico = obtenerTecnico(req.cuenta.tecnicoId);
  const primeraVez = !tecnico.modelo_id;
  elegirModelo(tecnico.id, req.body.modelo);
  const diagnosticado =
    db
      .prepare("SELECT COUNT(*) AS n FROM eventos WHERE tecnico_id = ? AND fase = 'diagnostico'")
      .get(tecnico.id).n > 0;
  // Un técnico nuevo sigue directo a su diagnóstico; si solo cambió de autobús, vuelve a su plan.
  res.redirect(
    primeraVez && !diagnosticado ? `/tecnicos/${tecnico.id}/diagnostico` : `/tecnicos/${tecnico.id}/plan`,
  );
}
