// Calibración de Entrena tus manos (como la de hand-lab), una sola vez por equipo y con calma:
// cada paso tiene "prepárate 3, 2, 1", luego mide y al final muestra "✓ listo" antes del siguiente.
//   1. Cuál cámara está arriba (si hay dos): se detecta sola al subir la mano, o con botones.
//   2. Orientación: "mueve la mano a tu derecha" y "hacia ti": así la imagen se voltea sola.
//   3. Poses: mano abierta, puño y pinza → umbrales a la medida de la persona y de la luz. Con la
//      mano abierta también se mide qué tan grande se ve la palma y dónde descansa: la herramienta
//      se dibuja a esa medida y en ese lugar (sin zoom: la mano y la herramienta en proporción).
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

const PASOS = ['rol', 'derecha', 'haciaTi', 'abierta', 'puno', 'pinza'];
export const TEXTOS = {
  rol: 'Pon la mano abajo, cerca de la cámara de ABAJO, y súbela despacio hacia la de ARRIBA',
  derecha: 'Pon la mano al centro y muévela despacio hacia tu DERECHA. Déjala ahí',
  haciaTi: 'Pon la mano al centro y acércala despacio HACIA TI. Déjala ahí',
  abierta: 'Deja la mano ABIERTA y quieta, donde vas a trabajar',
  puno: 'Cierra la mano en PUÑO, como si tomaras un mango',
  pinza: 'Junta el PULGAR y el ÍNDICE, como si tomaras una punta',
};
const LISTO = {
  rol: 'Ya sé cuál cámara está arriba',
  derecha: 'Derecha e izquierda listas',
  haciaTi: 'Hacia ti y hacia atrás listos',
  abierta: 'Mano abierta medida',
  puno: 'Puño medido',
  pinza: 'Pinza medida',
};
const PREPARA = 4000;
const MIDE = 3500;
const CONFIRMA = 1800;
const ASPECTO_CAMARA = 4 / 3;
const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

export class Calibracion {
  constructor() {
    this.activa = false;
  }

  get paso() {
    return PASOS[this.i];
  }

  get numero() {
    const primero = camaras.length > 1 ? 0 : 1;
    return `Paso ${this.i - primero + 1} de ${PASOS.length - primero}`;
  }

  empezar() {
    AJUSTES.area = {}; // ya no se recorta la imagen
    Object.assign(this, {
      activa: true,
      repetir: '',
      i: camaras.length > 1 ? 0 : 1,
      fase: 'prep',
      desde: 0,
      muestras: [],
      t: 0,
      ultimo: 0,
      poses: {},
    });
  }

  siguiente(ahora) {
    this.i += 1;
    Object.assign(this, { fase: 'prep', desde: ahora, muestras: [], t: 0, ultimo: 0 });
  }

  /** Cuál cámara está arriba (0 o 1): por los botones o por la detección. */
  elegirArriba(indice, ahora = performance.now()) {
    if (this.paso !== 'rol' || !camaras[indice]) return;
    AJUSTES.rol = {};
    camaras.forEach((c, k) => {
      AJUSTES.rol[c.id] = k === indice ? 'arriba' : 'abajo';
    });
    Object.assign(this, { fase: 'ok', desde: ahora, check: `${LISTO.rol}: la cámara ${indice + 1}` });
  }

  /**
   * ¿Cuál está arriba? Mientras la mano sube, en la cámara de arriba se ve cada vez más grande y en
   * la de abajo cada vez más chica. Se miran los últimos 3 s: si una creció bastante más, esa es.
   */
  detectarArriba(ahora) {
    const tamanos = camaras.slice(0, 2).map((c) => {
      const m = c.r?.landmarks?.[0];
      return m ? escala(m) : null;
    });
    if (tamanos.every((x) => x != null)) this.muestras.push([ahora, ...tamanos]);
    this.muestras = this.muestras.filter(([t]) => ahora - t < 3000);
    const n = this.muestras.length;
    if (n >= 30) {
      const tercio = Math.floor(n / 3);
      const cambio = [1, 2].map((k) => {
        const antes = promedio(this.muestras.slice(0, tercio).map((m) => m[k]));
        const despues = promedio(this.muestras.slice(-tercio).map((m) => m[k]));
        return (despues - antes) / Math.max(antes, 1e-3);
      });
      if (Math.abs(cambio[0] - cambio[1]) > 0.25) this.elegirArriba(cambio[0] > cambio[1] ? 0 : 1, ahora);
    }
    const ven = tamanos.every((x) => x != null);
    return {
      fase: 'mide',
      numero: this.numero,
      texto: ven ? TEXTOS.rol : 'Pon la mano entre las dos cámaras: las dos deben verla (o usa los botones)',
      progreso: Math.min(1, n / 45),
    };
  }

  /**
   * Se llama cada cuadro. Devuelve { fase: 'prep'|'mide'|'ok', numero, texto, progreso, cuenta, check }
   * o { listo, aviso } al terminar.
   */
  actualizar(ahora) {
    this.desde ||= ahora;
    const { paso } = this;
    if (this.fase === 'ok') {
      if (ahora - this.desde < CONFIRMA)
        return { fase: 'ok', numero: this.numero, texto: `✓ ${this.check}`, progreso: 1 };
      this.siguiente(ahora);
      if (this.i >= PASOS.length) return this.terminar();
      return this.actualizar(ahora);
    }
    if (paso === 'rol') return this.detectarArriba(ahora);
    if (this.fase === 'prep') {
      const falta = PREPARA - (ahora - this.desde);
      if (falta > 0)
        return {
          fase: 'prep',
          numero: this.numero,
          texto: `${this.repetir ? `${this.repetir} ` : 'Prepárate: '}${TEXTOS[paso]}`,
          cuenta: Math.ceil(falta / 1000),
          progreso: 0,
        };
      Object.assign(this, { fase: 'mide', ultimo: ahora });
    }
    // Midiendo: el tiempo solo corre mientras se ve la mano.
    const cam = camPosicion();
    const mano = cam?.r?.landmarks?.[0];
    const ag = agarre();
    const pose = ['abierta', 'puno', 'pinza'].includes(paso);
    const dt = Math.min(100, ahora - this.ultimo);
    this.ultimo = ahora;
    if (pose ? !ag || (paso === 'abierta' && !mano) : !mano)
      return {
        fase: 'mide',
        numero: this.numero,
        texto: 'No veo tu mano: ponla entre las dos cámaras',
        progreso: this.t / MIDE,
      };
    this.t += dt;
    if (pose) this.muestras.push({ g: ag.apertura, p: ag.pinza, mano: paso === 'abierta' ? mano : null });
    else this.muestras.push(palma(mano)); // cruda: todavía no se sabe el volteo
    if (this.t < MIDE)
      return { fase: 'mide', numero: this.numero, texto: TEXTOS[paso], progreso: this.t / MIDE };
    if (this.cerrar(paso, cam) === false) {
      // Movimiento poco claro: se repite el paso en lugar de adivinar el volteo.
      Object.assign(this, { fase: 'prep', desde: ahora, muestras: [], t: 0 });
      return this.actualizar(ahora);
    }
    this.repetir = '';
    Object.assign(this, { fase: 'ok', desde: ahora, check: LISTO[paso] });
    return { fase: 'ok', numero: this.numero, texto: `✓ ${this.check}`, progreso: 1 };
  }

  cerrar(paso, cam) {
    const m = this.muestras;
    if (paso === 'derecha' || paso === 'haciaTi') {
      // Dónde empezó (primer 20 %) contra dónde terminó (último 30 %), en la imagen cruda. El
      // movimiento debe ser claro y sobre todo en el eje pedido; si no, se repite el paso.
      const eje = paso === 'derecha' ? 'x' : 'y';
      const otro = eje === 'x' ? 'y' : 'x';
      const ini = m.slice(0, Math.max(3, Math.floor(m.length * 0.2)));
      const fin = m.slice(-Math.max(3, Math.floor(m.length * 0.3)));
      const d = promedio(fin.map((p) => p[eje])) - promedio(ini.map((p) => p[eje]));
      const dOtro = promedio(fin.map((p) => p[otro])) - promedio(ini.map((p) => p[otro]));
      if (Math.abs(d) < 0.08 || Math.abs(d) < 1.3 * Math.abs(dOtro)) {
        this.repetir =
          paso === 'derecha'
            ? 'No vi un movimiento claro. Otra vez, más amplio y solo hacia un lado:'
            : 'No vi un movimiento claro. Otra vez, más amplio y solo hacia ti:';
        return false;
      }
      const v = { x: false, y: false, ...AJUSTES.voltear?.[cam.id] };
      // Se quiere: a la derecha = x crece en pantalla; hacia ti = y crece (baja en pantalla).
      if (eje === 'x') v.x = d > 0;
      else v.y = d < 0;
      AJUSTES.voltear = { ...AJUSTES.voltear, [cam.id]: v };
      return true;
    }
    // Poses: el promedio de la segunda mitad (ya quieta).
    const quieta = m.slice(Math.floor(m.length / 2));
    this.poses[paso] = { g: promedio(quieta.map((s) => s.g)), p: promedio(quieta.map((s) => s.p)) };
    if (paso === 'abierta') {
      // Tamaño de la palma (en unidades de alto de la imagen) y dónde descansa la mano.
      const pantalla = quieta.map((s) => s.mano.map((q) => aPantalla(cam, q, false)));
      const tam = promedio(
        pantalla.map((q) => Math.hypot((q[9].x - q[0].x) * ASPECTO_CAMARA, q[9].y - q[0].y)),
      );
      const centros = pantalla.map((q) => palma(q));
      AJUSTES.mano = {
        ...AJUSTES.mano,
        [cam.id]: {
          palma: tam,
          centro: { x: promedio(centros.map((c) => c.x)), y: promedio(centros.map((c) => c.y)) },
        },
      };
    }
    return true;
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
      ok,
      aviso: ok
        ? 'Cámaras calibradas a tu mano.'
        : 'La mano abierta y el puño casi no se distinguen: revisa que la cámara de abajo vea tu palma, más luz o acerca la mano.',
    };
  }
}
