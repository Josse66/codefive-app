// Geometría de la lámina del autobús (viewBox 0 0 1000 400, frente a la derecha).
// Cada grupo de función tiene un recuadro de referencia (x, y) y el punto del autobús al que señala (ax, ay).
const LADO = 32;
const POSICIONES = {
  1: { x: 944, y: 356, ax: 930, ay: 250 },
  2: { x: 36, y: 356, ax: 104, ay: 232 },
  3: { x: 404, y: 8, ax: 420, ay: 50 },
  4: { x: 296, y: 356, ax: 318, ay: 270 },
  5: { x: 744, y: 356, ax: 790, ay: 300 },
  6: { x: 846, y: 356, ax: 858, ay: 282 },
  7: { x: 556, y: 356, ax: 580, ay: 292 },
  8: { x: 684, y: 8, ax: 700, ay: 132 },
  9: { x: 112, y: 8, ax: 128, ay: 92 },
};

// Con centro del recuadro (cx, cy) para la línea de referencia y el anillo de selección (sx, sy).
export const RECUADROS = Object.fromEntries(
  Object.entries(POSICIONES).map(([grupo, p]) => [
    grupo,
    { ...p, lado: LADO, cx: p.x + LADO / 2, cy: p.y + LADO / 2, sx: p.x - 5, sy: p.y - 5, sl: LADO + 10 },
  ]),
);

const PEOR_PRIMERO = ['brecha', 'en_desarrollo', 'dominada'];

// Estado del grupo: el peor estado de sus competencias; sin competencias, "sin_evaluar".
export function estadoGrupo(competencias) {
  if (competencias.length === 0) return 'sin_evaluar';
  return PEOR_PRIMERO.find((e) => competencias.some((c) => c.estado === e)) ?? 'dominada';
}
