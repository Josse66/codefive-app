// Guante CodeFive en Entrena tus manos (firmware del equipo de hardware: ESP32 + MPU-6050 +
// botón + zumbador + LED, por USB a 115200, unas 30 lecturas por segundo).
// Lo que aporta, donde la cámara es débil:
//   - Muñeca: inclinación de lado (roll) y hacia adelante (pitch) contra la "mano recta" calibrada.
//   - Agarre: el botón se aprieta al cerrar la mano en el mango.
//   - Tirones: qué tan rápido gira la mano (gmag, °/s), mucho más fino que la cámara.
// Y responde en la mano: pitido al llegar al clic, doble pitido en un error, LED con buen agarre.
import { SerialGlove } from '../entradas/serialGlove.js';

const FRESCO_MS = 600; // una lectura más vieja que esto ya no cuenta (cable flojo, puerto cerrado)

export const guante = {
  conectado: false,
  roll: 0,
  pitch: 0,
  yaw: 0,
  gmag: 0,
  grip: false,
  en: 0, // cuándo llegó la última lectura
  neutro: null, // { roll, pitch } de la mano recta (calibración)
  error: '',
};
const serial = new SerialGlove();
const avisos = new EventTarget();
export const alCambiar = (fn) => avisos.addEventListener('cambio', fn);

serial.addEventListener('dato', ({ detail }) => {
  if (detail.tipo === 'error') {
    guante.error = 'El sensor de movimiento no responde: revisa los cables SDA y SCL del MPU-6050.';
    avisos.dispatchEvent(new Event('cambio'));
    return;
  }
  if (detail.tipo) {
    if (detail.tipo === 'calibrado' || detail.tipo === 'listo') guante.error = '';
    avisos.dispatchEvent(new Event('cambio'));
    return;
  }
  Object.assign(guante, {
    roll: detail.roll ?? 0,
    pitch: detail.pitch ?? 0,
    yaw: detail.yaw ?? 0,
    gmag: detail.gmag ?? 0,
    grip: Boolean(detail.grip),
    en: performance.now(),
  });
});
serial.addEventListener('estado', ({ detail }) => {
  guante.conectado = detail.conectado;
  if (!detail.conectado) guante.neutro = null;
  avisos.dispatchEvent(new Event('cambio'));
});

/** ¿Hay lecturas recientes del guante? */
export const activo = () => guante.conectado && performance.now() - guante.en < FRESCO_MS;

export async function alternarConexion() {
  if (guante.conectado) await serial.desconectar();
  else await serial.conectar();
}

// ---------- Respuesta en la mano ----------
// El puerto deja una sola escritura a la vez: si choca con otra, ese aviso se pierde y ya.
const enviar = (c) => serial.enviar(c).catch(() => {});
export const pitar = () => activo() && enviar('B');
export function pitarDoble() {
  if (!activo()) return;
  enviar('B');
  setTimeout(() => enviar('B'), 220);
}
let ledPrendido = null;
export function led(prender) {
  if (!activo() || ledPrendido === prender) return;
  ledPrendido = prender;
  enviar(prender ? '1' : '0');
}

// ---------- Muñeca ----------
/** Recalibra el giroscopio (mano quieta ~1.5 s) y toma esta postura como "mano recta". */
export function calibrarMuneca() {
  if (!activo()) return Promise.resolve(false);
  enviar('C');
  return new Promise((listo) => {
    // El firmware tarda ~1.5 s; luego se promedia 0.6 s de la postura recta.
    setTimeout(() => {
      const muestras = [];
      const reloj = setInterval(() => muestras.push([guante.roll, guante.pitch]), 50);
      setTimeout(() => {
        clearInterval(reloj);
        if (!muestras.length) return listo(false);
        const prom = (k) => muestras.reduce((a, m) => a + m[k], 0) / muestras.length;
        guante.neutro = { roll: prom(0), pitch: prom(1) };
        return listo(true);
      }, 600);
    }, 1800);
  });
}

/** Grados que la muñeca se aleja de la mano recta (el mayor de los dos ejes). */
export const desviacion = () =>
  guante.neutro
    ? Math.max(Math.abs(guante.roll - guante.neutro.roll), Math.abs(guante.pitch - guante.neutro.pitch))
    : 0;
