// Sonidos del taller hechos con Web Audio: no hay archivos que descargar y funciona sin internet.
// Cada uno es corto y suave; se pueden apagar con sonido.activo = false.
let ctx = null;
const sonido = { activo: localStorage.getItem('sonido') !== 'no' };

function audio() {
  // El navegador solo deja crear el audio después de un clic de la persona.
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tono(frecuencia, duracion, { tipo = 'sine', volumen = 0.15, retraso = 0, hasta = null } = {}) {
  const a = audio();
  const t = a.currentTime + retraso;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frecuencia, t);
  if (hasta) osc.frequency.exponentialRampToValueAtTime(hasta, t + duracion);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volumen, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + duracion + 0.02);
}

function ruido(duracion, { filtro = 2000, q = 1, volumen = 0.2, retraso = 0, tipoFiltro = 'bandpass' } = {}) {
  const a = audio();
  const t = a.currentTime + retraso;
  const muestras = Math.floor(a.sampleRate * duracion);
  const buffer = a.createBuffer(1, muestras, a.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i += 1) datos[i] = (Math.random() * 2 - 1) * (1 - i / muestras);
  const fuente = a.createBufferSource();
  fuente.buffer = buffer;
  const f = a.createBiquadFilter();
  f.type = tipoFiltro;
  f.frequency.value = filtro;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = volumen;
  fuente.connect(f).connect(g).connect(a.destination);
  fuente.start(t);
}

// Motor diésel arrancando: marcha que gira y luego el ronroneo grave que se estabiliza.
function arranque() {
  const a = audio();
  const t = a.currentTime;
  for (let i = 0; i < 6; i += 1) ruido(0.08, { filtro: 300, q: 2, volumen: 0.25, retraso: i * 0.11 });
  const osc = a.createOscillator();
  const lfo = a.createOscillator();
  const lfoG = a.createGain();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(38, t + 0.65);
  lfo.frequency.value = 11;
  lfoG.gain.value = 6;
  lfo.connect(lfoG).connect(osc.frequency);
  f.type = 'lowpass';
  f.frequency.value = 260;
  g.gain.setValueAtTime(0.0001, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.9);
  g.gain.setValueAtTime(0.22, t + 2.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  osc.connect(f).connect(g).connect(a.destination);
  osc.start(t + 0.6);
  lfo.start(t + 0.6);
  osc.stop(t + 3.3);
  lfo.stop(t + 3.3);
}

const SONIDOS = {
  // Herramientas
  llave: () =>
    [0, 0.09, 0.18, 0.27].forEach((r) => ruido(0.04, { filtro: 3800, q: 8, volumen: 0.25, retraso: r })),
  linterna: () => ruido(0.03, { filtro: 2500, q: 4, volumen: 0.2 }),
  mano: () => ruido(0.12, { filtro: 400, q: 1, volumen: 0.3, tipoFiltro: 'lowpass' }),
  multimetro: () => tono(1200, 0.12, { volumen: 0.08 }),
  escaner: () => {
    tono(880, 0.08, { volumen: 0.07 });
    tono(1320, 0.1, { volumen: 0.07, retraso: 0.1 });
  },
  jabon: () =>
    [0, 0.07, 0.15, 0.22, 0.3].forEach((r, i) =>
      tono(500 + i * 90, 0.06, { volumen: 0.05, retraso: r, hasta: 900 + i * 120 }),
    ),
  // Resultados
  bien: () => {
    tono(660, 0.12, { volumen: 0.08 });
    tono(990, 0.18, { volumen: 0.08, retraso: 0.1 });
  },
  mal: () => tono(180, 0.25, { tipo: 'square', volumen: 0.05, hasta: 120 }),
  critico: () =>
    [0, 0.28, 0.56].forEach((r) => {
      tono(880, 0.22, { tipo: 'square', volumen: 0.06, retraso: r });
      tono(660, 0.22, { tipo: 'square', volumen: 0.05, retraso: r + 0.14 });
    }),
  // Piezas
  retirar: () => {
    ruido(0.15, { filtro: 900, q: 2, volumen: 0.25 });
    ruido(0.1, { filtro: 600, q: 1, volumen: 0.3, retraso: 1.0 });
  },
  montar: () => ruido(0.12, { filtro: 1200, q: 3, volumen: 0.25, retraso: 0.9 }),
  arranque,
};

export function sonar(nombre) {
  if (!sonido.activo) return;
  try {
    SONIDOS[nombre]?.();
  } catch {
    // Sin audio (navegador sin permiso o sin bocinas): la app sigue igual.
  }
}

export function alternarSonido() {
  sonido.activo = !sonido.activo;
  localStorage.setItem('sonido', sonido.activo ? 'si' : 'no');
  if (sonido.activo) sonar('bien');
  return sonido.activo;
}

export const sonidoActivo = () => sonido.activo;
