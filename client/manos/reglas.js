// Geometría de "Entrena tus manos": señales grandes y robustas sobre los 21 puntos de MediaPipe
// (dónde está la palma, si la mano está cerrada o en pinza, hacia dónde gira). No se usan los
// ángulos finos de cada dedo: con una cámara web tienen mucho error (ver la investigación).
//
// Las manos llegan en coordenadas de 0 a 1 ya en espejo. Para medir distancias se pasa a
// "unidades de alto": x × (ancho / alto), y igual. Así un círculo se ve como círculo.

const PALMA = [0, 5, 9, 13, 17];
const PUNTAS = [8, 12, 16, 20];

export const enUnidades = (p, aspecto) => ({ x: p.x * aspecto, y: p.y });
const resta = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const grados = (rad) => (rad * 180) / Math.PI;

/** Centro de la palma (promedio de la muñeca y las bases de los dedos). */
export function palma(mano) {
  const s = PALMA.reduce((acc, i) => ({ x: acc.x + mano[i].x, y: acc.y + mano[i].y }), { x: 0, y: 0 });
  return { x: s.x / PALMA.length, y: s.y / PALMA.length };
}

/** Tamaño de la mano (muñeca a la base del dedo medio): normaliza lo cerca o lejos que esté. */
export const escala = (mano) => distancia(mano[0], mano[9]) || 1e-6;

// Puño y pinza se miden con los puntos 3D de MediaPipe (en metros, "worldLandmarks"): no cambian
// si la mano gira frente a la cámara. Umbrales probados por el equipo en hand-lab.
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const tamano3 = (w) => d3(w[0], w[9]) || 1e-6;

/** Qué tan abierta está la mano: puntas de los dedos a la muñeca, en tamaños de palma. Puño < 1.35 < abierta. */
export const apertura = (w) => PUNTAS.reduce((s, i) => s + d3(w[i], w[0]), 0) / PUNTAS.length / tamano3(w);

/** Distancia pulgar–índice en tamaños de palma (pinza, "como lápiz"). Pinza < 0.35. */
export const pinza = (w) => d3(w[4], w[8]) / tamano3(w);

/** Interruptor con dos umbrales para que no parpadee (cerrar < bajo, abrir > alto). */
export class Histeresis {
  constructor(bajo, alto) {
    Object.assign(this, { bajo, alto, activo: false });
  }

  actualizar(valor) {
    if (!this.activo && valor < this.bajo) this.activo = true;
    else if (this.activo && valor > this.alto) this.activo = false;
    return this.activo;
  }
}

// ---------- Torquímetro (tipo "giro") ----------

/**
 * Dónde queda la palma respecto al mango: t = posición a lo largo (0 en la tuerca, 1 en la
 * punta) y lejos = distancia al eje del mango (en unidades de alto).
 */
export function sobreMango(palmaU, pivoteU, anguloGrados, largo) {
  const a = (anguloGrados * Math.PI) / 180;
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const rel = resta(palmaU, pivoteU);
  return {
    t: (rel.x * dir.x + rel.y * dir.y) / largo,
    lejos: Math.abs(rel.x * dir.y - rel.y * dir.x),
  };
}

/** Ángulo de la palma alrededor de la tuerca (grados; crece hacia abajo, en el sentido del reloj). */
export const anguloAlrededor = (palmaU, pivoteU) =>
  grados(Math.atan2(palmaU.y - pivoteU.y, palmaU.x - pivoteU.x));

/**
 * Muñeca con la cámara: al tomar un mango, el eje de la mano (muñeca → base del dedo medio)
 * queda perpendicular al mango. Devuelve cuántos grados se desvía de eso (0 = recta).
 */
export function desviacionMuneca(mano, aspecto, anguloMango) {
  const eje = resta(enUnidades(mano[9], aspecto), enUnidades(mano[0], aspecto));
  const angEje = grados(Math.atan2(eje.y, eje.x));
  const normal = anguloMango - 90; // perpendicular al mango, hacia arriba
  const d = Math.abs(((angEje - normal + 540) % 360) - 180);
  return Math.min(d, 180 - d);
}

// ---------- Multímetro (tipo "punta") ----------

export const dentro = (p, [x0, y0, x1, y1]) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;

/** Calificación: 100 menos el peso de cada falla distinta (cada una cuenta una vez por intento). */
export function calificar(reglas, fallas) {
  const resta100 = [...fallas].reduce((s, id) => s + (reglas.find((r) => r.id === id)?.peso ?? 0), 0);
  return Math.max(0, 100 - resta100);
}
