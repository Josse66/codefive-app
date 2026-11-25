// Calibración de Entrena tus manos (unos 25 s, como la de hand-lab), una sola vez por equipo:
//   1. Cuál cámara está arriba (si hay dos).
//   2. Orientación: "mueve la mano a tu derecha" y "hacia ti": así la imagen se voltea sola.
//   3. Poses: mano abierta, puño y pinza → umbrales a la medida de la persona y de la luz.
//   4. Área de trabajo: la herramienta se dibuja donde de verdad alcanza la mano.
import {
  AJUSTES,
  agarre,
  aPantalla,
  camaras,
  camPosicion,
  guardarAjustes,
  llaveCalibracion,
} from './camaras.js';
import { escala, palma } from './reglas.js';

const PASOS = ['rol', 'derecha', 'haciaTi', 'abierta', 'puno', 'pinza', 'area'];
export const TEXTOS = {
  rol: 'Pon la mano abajo, cerca de la cámara de ABAJO, y súbela despacio hacia la de ARRIBA',
  derecha: 'Mueve la mano despacio hacia tu DERECHA y regrésala',
  haciaTi: 'Ahora muévela HACIA TI y regrésala',
  abierta: 'Deja la mano ABIERTA y quieta entre las dos cámaras',
  puno: 'Cierra la mano en PUÑO, como si tomaras un mango',
  pinza: 'Junta el PULGAR y el ÍNDICE, como si tomaras una punta',
  area: 'Mueve la mano despacio por TODA el área donde vas a trabajar',
};
const DURACION = { derecha: 2500, haciaTi: 2500, abierta: 2500, puno: 2500, pinza: 2500, area: 6000 };
const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

export class Calibracion {
  constructor() {
    this.activa = false;
    this.aviso = '';
  }

  get paso() {
    return PASOS[this.i];
  }

  empezar() {
    const cam = camPosicion();
    // El área anterior se olvida: se vuelve a medir con la imagen completa.
    if (AJUSTES.area && cam) AJUSTES.area = {};
    Object.assign(this, {
      activa: true,
      i: camaras.length > 1 ? 0 : 1,
      muestras: [],
      t: 0,
      ultimo: 0,
      poses: {},
    });
  }

  /** La persona tocó la imagen izquierda (0) o derecha (1) en el paso "rol". */
  elegirArriba(indice) {
    if (this.paso !== 'rol' || !camaras[indice]) return;
    AJUSTES.rol = {};
    camaras.forEach((c, k) => {
      AJUSTES.rol[c.id] = k === indice ? 'arriba' : 'abajo';
    });
    this.i += 1;
    this.muestras = [];
    this.t = 0;
  }

  /**
   * ¿Cuál está arriba? Mientras la mano sube, en la cámara de arriba se ve cada vez más grande y en
   * la de abajo cada vez más chica. Se miran los últimos 3 s: si una creció y la otra no, esa es la
   * de arriba. (También se puede elegir con los botones.)
   */
  detectarArriba(ahora) {
    const tamanos = camaras.slice(0, 2).map((c) => {
      const m = c.r?.landmarks?.[0];
      return m ? escala(m) : null;
    });
    if (tamanos.every((x) => x != null)) this.muestras.push([ahora, ...tamanos]);
    this.muestras = this.muestras.filter(([t]) => ahora - t < 3000);
    const n = this.muestras.length;
    const progreso = Math.min(1, n / 45);
    if (n >= 30) {
      const tercio = Math.floor(n / 3);
      const cambio = [1, 2].map((k) => {
        const antes = promedio(this.muestras.slice(0, tercio).map((m) => m[k]));
        const despues = promedio(this.muestras.slice(-tercio).map((m) => m[k]));
        return (despues - antes) / Math.max(antes, 1e-3);
      });
      // Una creció al menos 25 % más que la otra: esa es la de arriba.
      if (Math.abs(cambio[0] - cambio[1]) > 0.25) {
        this.elegirArriba(cambio[0] > cambio[1] ? 0 : 1);
        return {
          texto:
            cambio[0] > cambio[1]
              ? 'Listo: la de arriba es la cámara 1'
              : 'Listo: la de arriba es la cámara 2',
          progreso: 1,
        };
      }
    }
    const texto = tamanos.every((x) => x != null)
      ? TEXTOS.rol
      : 'Pon la mano entre las dos cámaras: las dos deben verla';
    return { texto, progreso };
  }

  /** Se llama cada cuadro. Devuelve { texto, progreso } o { listo, aviso } al terminar. */
  actualizar(ahora) {
    const { paso } = this;
    if (paso === 'rol') return this.detectarArriba(ahora);
    const cam = camPosicion();
    const mano = cam?.r?.landmarks?.[0];
    const ag = agarre();
    const pose = ['abierta', 'puno', 'pinza'].includes(paso);
    const dt = this.ultimo ? Math.min(100, ahora - this.ultimo) : 0;
    this.ultimo = ahora;
    if (pose ? !ag : !mano)
      return { texto: 'No veo tu mano: ponla entre las dos cámaras', progreso: this.t / DURACION[paso] };
    this.t += dt;
    if (pose) this.muestras.push([ag.apertura, ag.pinza]);
    else if (paso === 'area') this.muestras.push(aPantalla(cam, palma(mano), false));
    else this.muestras.push(palma(mano)); // cruda: todavía no se sabe el volteo
    if (this.t < DURACION[paso]) return { texto: TEXTOS[paso], progreso: this.t / DURACION[paso] };
    this.cerrar(paso, cam);
    this.i += 1;
    Object.assign(this, { t: 0, muestras: [] });
    if (this.i >= PASOS.length) return this.terminar();
    return { texto: TEXTOS[this.paso], progreso: 0 };
  }

  cerrar(paso, cam) {
    const m = this.muestras;
    if (paso === 'derecha' || paso === 'haciaTi') {
      // El punto más lejano del inicio dice hacia dónde se movió la mano en la imagen cruda.
      const eje = paso === 'derecha' ? 'x' : 'y';
      const inicio = promedio(m.slice(0, 5).map((p) => p[eje]));
      const lejos = m.reduce(
        (a, p) => (Math.abs(p[eje] - inicio) > Math.abs(a - inicio) ? p[eje] : a),
        inicio,
      );
      const v = { x: false, y: false, ...AJUSTES.voltear?.[cam.id] };
      // Se quiere: a la derecha = x crece en pantalla; hacia ti = y crece (baja en pantalla).
      if (eje === 'x') v.x = lejos - inicio > 0;
      else v.y = lejos - inicio < 0;
      AJUSTES.voltear = { ...AJUSTES.voltear, [cam.id]: v };
      return;
    }
    if (paso === 'area') {
      // Rectángulo que cubre lo recorrido, cuadrado en coordenadas de la cámara (no deforma la imagen).
      const xs = m.map((p) => p.x);
      const ys = m.map((p) => p.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const lado = Math.min(
        1,
        Math.max(0.45, Math.max(...xs) - Math.min(...xs) + 0.25, Math.max(...ys) - Math.min(...ys) + 0.25),
      );
      const x0 = Math.min(Math.max(0, cx - lado / 2), 1 - lado);
      const y0 = Math.min(Math.max(0, cy - lado / 2), 1 - lado);
      AJUSTES.area = { ...AJUSTES.area, [cam.id]: [x0, y0, x0 + lado, y0 + lado] };
      return;
    }
    // Poses: el promedio de la segunda mitad (ya quieta).
    const quieta = m.slice(Math.floor(m.length / 2));
    this.poses[paso] = { g: promedio(quieta.map((s) => s[0])), p: promedio(quieta.map((s) => s[1])) };
  }

  terminar() {
    const { abierta, puno, pinza } = this.poses;
    const gapG = abierta.g - puno.g;
    const gapP = abierta.p - pinza.p;
    // Como thresholdsFrom de hand-lab: "cerrar" cerca de la pose cerrada y "abrir" más cerca de la abierta.
    const ok = gapG >= 0.4 && gapP >= 0.3;
    if (ok) {
      AJUSTES.umbrales = {
        puno: [puno.g + 0.35 * gapG, puno.g + 0.6 * gapG],
        pinza: [pinza.p + 0.35 * gapP, pinza.p + 0.6 * gapP],
      };
    }
    AJUSTES.calibrado = llaveCalibracion();
    guardarAjustes();
    this.activa = false;
    return {
      listo: true,
      aviso: ok
        ? 'Listo: cámaras calibradas a tu mano.'
        : 'Calibrado, pero la mano abierta y el puño casi no se distinguen: más luz o acerca la mano. Puedes calibrar otra vez en "Ajustar cámaras".',
    };
  }
}
