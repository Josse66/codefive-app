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
// El guante del equipo no trae zumbador: la respuesta en la mano es con el LED (el sonido sale de
// la laptop). Mientras destella, el LED no sigue al agarre; al terminar vuelve a como estaba.
let ledPrendido = null;
let destellando = false;
function destellar(veces) {
  if (!activo() || destellando) return;
  destellando = true;
  const pasos = [];
  for (let k = 0; k < veces; k += 1) pasos.push('1', '0');
  pasos.forEach((c, k) => setTimeout(() => enviar(c), k * 130));
  setTimeout(
    () => {
      destellando = false;
      if (ledPrendido) enviar('1');
    },
    pasos.length * 130 + 50,
  );
}
/** Clic del torquímetro o tuerca apretada: un destello. */
export const pitar = () => destellar(1);
/** Error: tres destellos rápidos. */
export const pitarDoble = () => destellar(3);
/** LED fijo mientras el agarre es bueno. */
export function led(prender) {
  if (!activo() || ledPrendido === prender) return;
  ledPrendido = prender;
  if (!destellando) enviar(prender ? '1' : '0');
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

// ---------- Modo demostración (sin guante) ----------
// Para presentar sin depender del hardware: el mouse hace de muñeca y la barra espaciadora (o
// mantener el clic sobre la imagen) hace de botón de la palma. Llega el mismo tipo de lecturas que
// manda el guante, así que el ejercicio, los avisos y la calificación funcionan igual.
//   - Mover el mouse a los lados = girar la muñeca (como con la llave).
//   - Mover el mouse arriba y abajo = doblar la muñeca (sirve para mostrar el error).
let reloj = null;
const sim = { x: 0.5, y: 0.5, espacio: false, clic: false, ultimo: 0 };
const alMover = (e) =>
  Object.assign(sim, { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
const alTecla = (abajo) => (e) => {
  if (e.code !== 'Space' || e.target.closest?.('input, textarea')) return;
  e.preventDefault();
  sim.espacio = abajo;
  if (abajo) sim.ultimo = performance.now();
};
const teclaAbajo = alTecla(true);
const teclaArriba = alTecla(false);
const clicAbajo = (e) => {
  if (e.target.id === 'lienzo-manos') Object.assign(sim, { clic: true, ultimo: performance.now() });
};
const clicArriba = () => {
  sim.clic = false;
};

export function simular(prender) {
  clearInterval(reloj);
  ['mousemove', 'keydown', 'keyup', 'mousedown', 'mouseup'].forEach((t, k) =>
    window.removeEventListener(t, [alMover, teclaAbajo, teclaArriba, clicAbajo, clicArriba][k]),
  );
  Object.assign(guante, { simulado: prender, conectado: prender, neutro: null, error: '' });
  if (prender) {
    window.addEventListener('mousemove', alMover);
    window.addEventListener('keydown', teclaAbajo);
    window.addEventListener('keyup', teclaArriba);
    window.addEventListener('mousedown', clicAbajo);
    window.addEventListener('mouseup', clicArriba);
    let antes = performance.now();
    reloj = setInterval(() => {
      const ahora = performance.now();
      const dt = Math.max(0.001, (ahora - antes) / 1000);
      antes = ahora;
      const temblor = () => (Math.random() - 0.5) * 0.4;
      const roll = guante.roll + ((sim.x - 0.5) * 140 - guante.roll) * 0.35 + temblor();
      const pitch = guante.pitch + ((sim.y - 0.5) * 50 - guante.pitch) * 0.35 + temblor();
      const gmag = Math.hypot(roll - guante.roll, pitch - guante.pitch) / dt;
      Object.assign(guante, {
        roll,
        pitch,
        yaw: 0,
        gmag,
        grip: sim.espacio || sim.clic || ahora - sim.ultimo < 250,
        en: ahora,
      });
    }, 33);
  }
  avisos.dispatchEvent(new Event('cambio'));
}
