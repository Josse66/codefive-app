// Cámaras de Entrena tus manos. Como en hand-lab: dos cámaras USB, una ARRIBA apuntando hacia
// abajo y otra ABAJO apuntando hacia arriba. Cada una tiene su trabajo:
//   - Arriba (posición): ve el dorso y el recorrido de la mano. Da dónde está y hacia dónde se
//     mueve; la herramienta se dibuja sobre esta vista.
//   - Abajo (agarre): ve la palma y los dedos. Da si la mano está cerrada o en pinza (desde arriba
//     un puño tapa las puntas de los dedos, el punto débil de MediaPipe).
// Si una no ve la mano, la otra la respalda. Con una sola cámara, esa hace todo.
// Todo lo calibrado (cuál es cuál, volteo, área y umbrales) se guarda en el navegador.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { OneEuro } from './oneEuro.js';
import { apertura, pinza } from './reglas.js';

export const AJUSTES = JSON.parse(localStorage.getItem('manosCamaras') ?? '{}');
// { ids: [], rol: { id: 'arriba'|'abajo' }, voltear: { id: { x, y } }, area: { id: [x0,y0,x1,y1] },
//   umbrales: { puno: [on, off], pinza: [on, off] }, mejorar: bool, calibrado: 'ids' }
export const guardarAjustes = () => localStorage.setItem('manosCamaras', JSON.stringify(AJUSTES));

const DE_LAPTOP = /integrated|integrada|hd webcam|facetime|ir camera|infrarroj|front|frontal/i;
const PREFERIDAS = /general|usb/i;
export const camaras = []; // { id, etiqueta, video, detector, ultimo, r, score, suaves }

const nuevosSuaves = () =>
  [0, 1].map(() => Array.from({ length: 42 }, () => new OneEuro({ minCutoff: 1.2, beta: 6 })));

// ---------- Abrir (una por una, con límite de tiempo y resolución de respaldo) ----------
function conLimite(promesa, ms, que) {
  let reloj;
  const limite = new Promise((_, no) => {
    reloj = setTimeout(() => no(new Error(`${que} no respondió en ${ms / 1000} s`)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(reloj));
}
const INTENTOS = [{ width: 640, height: 480, frameRate: 30 }, { width: 320, height: 240, frameRate: 30 }, {}];
// Con dos cámaras USB se pide 320×240 desde el principio: a 640×480 las dos no caben en el mismo
// puerto o hub y una se queda en negro. Para las manos dentro de la caja alcanza.
const INTENTOS_DOS = [{ width: 320, height: 240, frameRate: 30 }, { width: 320, height: 240 }, {}];
const POR_QUE = {
  NotReadableError:
    'la está usando otro programa o pestaña (cierra hand-lab, la app Cámara, Teams o la pestaña de entrar con gafete)',
  AbortError: 'la está usando otro programa o pestaña',
  OverconstrainedError: 'no acepta la resolución pedida',
  NotFoundError: 'no está conectada',
  NotAllowedError: 'no hay permiso',
};
export const motivo = (e) => POR_QUE[e.name] ?? e.message;

async function elegirCamaras() {
  const lista = async () =>
    (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  let dispositivos = await lista();
  if (dispositivos.some((d) => !d.label)) {
    const prueba = await navigator.mediaDevices.getUserMedia({ video: true });
    prueba.getTracks().forEach((t) => t.stop());
    dispositivos = await lista();
  }
  const guardadas = (AJUSTES.ids ?? [])
    .map((id) => dispositivos.find((d) => d.deviceId === id))
    .filter(Boolean);
  if (guardadas.length) return { elegidas: guardadas, dispositivos };
  const externas = dispositivos.filter((d) => !DE_LAPTOP.test(d.label));
  const ordenadas = [
    ...externas.filter((d) => PREFERIDAS.test(d.label)),
    ...externas.filter((d) => !PREFERIDAS.test(d.label)),
  ];
  return { elegidas: (ordenadas.length ? ordenadas : dispositivos).slice(0, 2), dispositivos };
}

async function abrirVideo(dispositivo, intentos) {
  let ultimoError = null;
  /* eslint-disable no-await-in-loop -- cada intento depende de que el anterior falle */
  for (let k = 0; k < intentos.length; k += 1) {
    let stream = null;
    try {
      stream = await conLimite(
        navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: dispositivo.deviceId }, ...intentos[k] },
        }),
        8000,
        dispositivo.label,
      );
      const v = document.createElement('video');
      Object.assign(v, { srcObject: stream, muted: true, playsInline: true });
      await conLimite(v.play(), 5000, `El video de ${dispositivo.label}`);
      return v;
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop());
      ultimoError = error;
    }
  }
  /* eslint-enable no-await-in-loop */
  throw ultimoError;
}

function crearDetector(vision) {
  const crear = (delegate) =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  return crear('GPU').catch(() => crear('CPU'));
}

/** Abre las cámaras. avisar(texto) cuenta el paso en curso. */
export async function encenderCamaras(avisar) {
  avisar('Pidiendo permiso de cámara…');
  const { elegidas, dispositivos } = await conLimite(elegirCamaras(), 15000, 'El permiso de cámara');
  avisar('Cargando el detector de manos…');
  const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  const fallas = [];
  /* eslint-disable no-await-in-loop -- una por una: dos USB a la vez se pelean el ancho de banda */
  for (let k = 0; k < elegidas.length; k += 1) {
    const d = elegidas[k];
    avisar(`Abriendo ${d.label}…`);
    try {
      const video = await abrirVideo(d, elegidas.length > 1 ? INTENTOS_DOS : INTENTOS);
      camaras.push({
        id: d.deviceId,
        etiqueta: d.label || 'Cámara',
        video,
        detector: await crearDetector(vision),
        ultimo: -1,
        cambio: performance.now(),
        r: null,
        score: 0,
        suaves: nuevosSuaves(),
      });
    } catch (error) {
      fallas.push(`${d.label}: ${motivo(error)}`);
    }
  }
  /* eslint-enable no-await-in-loop */
  return { fallas, dispositivos, pedidas: elegidas.length };
}

// ---------- Roles, volteo y área ----------
export const volteo = (cam) => AJUSTES.voltear?.[cam.id] ?? { x: false, y: false };
// Ya no se recorta la imagen (el zoom dejaba la mano enorme y la herramienta chica): la herramienta
// se ajusta al tamaño de la mano. Se ignora un área guardada por una calibración anterior.
export const area = () => [0, 0, 1, 1];
export const rolDe = (cam) => AJUSTES.rol?.[cam.id] ?? null;
/** La de arriba da la posición; si no hay roles todavía, la primera. */
export const camPosicion = () => camaras.find((c) => rolDe(c) === 'arriba') ?? camaras[0];
/** La de abajo da el agarre; con una sola cámara, la misma. */
export const camAgarre = () =>
  camaras.find((c) => rolDe(c) === 'abajo') ?? camaras.find((c) => c !== camPosicion()) ?? camaras[0];
export const llaveCalibracion = () =>
  camaras
    .map((c) => c.id)
    .sort()
    .join('|');
// Calibrada con esta versión: además de la llave de las cámaras, debe tener la medida de la mano.
export const calibrada = () =>
  AJUSTES.calibrado === llaveCalibracion() && Boolean(AJUSTES.mano?.[camPosicion()?.id]);

/** Punto crudo (0..1 de la cámara) → pantalla: volteo (espejo por defecto) y luego el área de trabajo. */
export function aPantalla(cam, p, conArea = true) {
  const v = volteo(cam);
  const x = v.x ? p.x : 1 - p.x;
  const y = v.y ? 1 - p.y : p.y;
  if (!conArea) return { x, y };
  const [x0, y0, x1, y1] = area(cam);
  return { x: (x - x0) / (x1 - x0), y: (y - y0) / (y1 - y0) };
}

// ---------- Cada cuadro ----------
// Un lienzo por cámara (pueden tener resoluciones distintas).
const lienzosMejora = new Map();
function fuente(cam) {
  if (!AJUSTES.mejorar) return cam.video;
  // Poca luz: más brillo y contraste antes de detectar (como el "enhance" de hand-lab).
  const v = cam.video;
  if (!lienzosMejora.has(cam.id)) lienzosMejora.set(cam.id, document.createElement('canvas'));
  const lienzo = lienzosMejora.get(cam.id);
  if (lienzo.width !== v.videoWidth) {
    lienzo.width = v.videoWidth;
    lienzo.height = v.videoHeight;
  }
  const c = lienzo.getContext('2d');
  c.filter = 'brightness(1.25) contrast(1.4)';
  c.drawImage(v, 0, 0);
  return lienzo;
}

/** Detecta en las cámaras con cuadro nuevo. Devuelve true si la de posición trajo cuadro nuevo. */
export function detectar(ahora) {
  let nuevo = false;
  let otra = false;
  const pos = camPosicion();
  camaras.forEach((cam) => {
    if (cam.video.currentTime === cam.ultimo || cam.video.readyState < 2) return;
    const r = cam.detector.detectForVideo(fuente(cam), ahora);
    Object.assign(cam, {
      ultimo: cam.video.currentTime,
      cambio: ahora,
      r,
      score: r.handedness?.[0]?.[0]?.score ?? 0,
    });
    if (!r.landmarks?.length) cam.suaves.flat().forEach((f) => f.reset());
    if (cam === pos) nuevo = true;
    else otra = true;
  });
  // Si la de arriba dejó de mandar imagen, se sigue dibujando con la otra (para avisar y no congelarse).
  return nuevo || (otra && ahora - (pos?.cambio ?? 0) > 1500);
}

/** Cámaras que no mandan imagen nueva desde hace más de 2.5 s (USB sin ancho de banda, cable flojo). */
export const sinImagen = (ahora) => camaras.filter((c) => ahora - c.cambio > 2500);

/** Manos de una cámara en coordenadas de pantalla, sin temblor. */
export function manosEnPantalla(cam, ahora, conArea = true) {
  return (cam?.r?.landmarks ?? []).map((m, k) =>
    m.map((p, i) => {
      const s = aPantalla(cam, p, conArea);
      return {
        x: cam.suaves[k][i * 2].filter(s.x, ahora / 1000),
        y: cam.suaves[k][i * 2 + 1].filter(s.y, ahora / 1000),
      };
    }),
  );
}

/**
 * Agarre con la mejor vista: la de abajo (ve la palma) si ve la mano con confianza; si no, la de
 * arriba. Si las dos ven y no coinciden, manda la de más confianza (comparar vistas, V-Hands 2024).
 * Devuelve { apertura, pinza, vista } de la mano más segura, o null.
 */
export function agarre() {
  const opciones = [camAgarre(), camPosicion()]
    .filter((c, i, todas) => c && todas.indexOf(c) === i && c.r?.worldLandmarks?.length)
    .map((c) => ({ c, score: c.score + (c === camAgarre() ? 0.15 : 0) }))
    .sort((a, b) => b.score - a.score);
  const mejor = opciones[0];
  if (!mejor) return null;
  const w = mejor.c.r.worldLandmarks[0];
  return { apertura: apertura(w), pinza: pinza(w), vista: rolDe(mejor.c) ?? 'única' };
}

/** Pinza de cada mano vista desde abajo y desde arriba (para el multímetro: ¿alguna mano en pinza?). */
export function pinzas() {
  return [camAgarre(), camPosicion()]
    .filter((c, i, todas) => c && todas.indexOf(c) === i)
    .flatMap((c) => (c.r?.worldLandmarks ?? []).map((w) => pinza(w)));
}

// ---------- Dibujo ----------
/** Video de la cámara de posición, recortado al área de trabajo (así la mano coincide con sus puntos). */
export function dibujarPrincipal(ctx, ancho, alto) {
  const cam = camPosicion();
  if (!cam) return;
  const v = volteo(cam);
  const [x0, y0, x1, y1] = area(cam);
  ctx.save();
  ctx.scale(ancho / (x1 - x0), alto / (y1 - y0));
  ctx.translate(-x0, -y0);
  ctx.translate(v.x ? 0 : 1, v.y ? 1 : 0);
  ctx.scale(v.x ? 1 : -1, v.y ? -1 : 1);
  ctx.drawImage(cam.video, 0, 0, 1, 1);
  ctx.restore();
  ctx.fillStyle = 'rgba(20,28,36,.25)';
  ctx.fillRect(0, 0, ancho, alto);
}

/** Recuadro con la vista de abajo (la palma), para ver que el agarre se lee bien. */
export function dibujarRecuadro(ctx, ancho, alto, cerrada) {
  const cam = camAgarre();
  if (!cam || cam === camPosicion()) return;
  const w = ancho * 0.26;
  const h = (w * 3) / 4;
  const x = ancho - w - 12;
  const y = 12;
  const v = volteo(cam);
  ctx.save();
  ctx.translate(x + (v.x ? 0 : w), y + (v.y ? h : 0));
  ctx.scale(v.x ? 1 : -1, v.y ? -1 : 1);
  ctx.drawImage(cam.video, 0, 0, w, h);
  ctx.restore();
  ctx.strokeStyle = cerrada ? '#2f7d43' : '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = 'rgba(20,28,36,.8)';
  ctx.fillRect(x, y + h - 26, w, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 15px Archivo, sans-serif';
  ctx.fillText(`Abajo · agarre: ${cerrada ? 'cerrada' : 'abierta'}`, x + 8, y + h - 8);
}
