// Copiado de guante/web (equipo de hardware).
// Detecta una mano con la cámara (MediaPipe Hand Landmarker) y el gesto de pinza.
// Eventos: 'mano' ({ x, y, pinza, apertura }), 'perdida' (la mano salió de cuadro).
// x, y van de 0 a 1 en coordenadas de pantalla (x ya está en espejo).

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const URL_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const URL_MODELO =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class HandTracker extends EventTarget {
  // Para trabajar sin internet, copien la carpeta wasm y el archivo .task a /public
  // y pasen sus rutas locales en wasmUrl y modelUrl.
  constructor(
    video,
    { wasmUrl = URL_WASM, modelUrl = URL_MODELO, umbralCerrar = 0.35, umbralAbrir = 0.5 } = {},
  ) {
    super();
    this.video = video;
    this.wasmUrl = wasmUrl;
    this.modelUrl = modelUrl;
    this.umbralCerrar = umbralCerrar; // calibrar por persona con el valor de "apertura"
    this.umbralAbrir = umbralAbrir;
    this.detector = null;
    this.activo = false;
    this.pinza = false;
    this.habiaMano = false;
    this.ultimoTiempo = -1;
  }

  async iniciar() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    this.video.srcObject = stream;
    await this.video.play();
    const fileset = await FilesetResolver.forVisionTasks(this.wasmUrl);
    this.detector = await this.#crearDetector(fileset, 'GPU').catch(() =>
      this.#crearDetector(fileset, 'CPU'),
    );
    this.activo = true;
    this.#ciclo();
  }

  #crearDetector(fileset, delegate) {
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: this.modelUrl, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  }

  #ciclo() {
    if (!this.activo) return;
    if (this.video.currentTime !== this.ultimoTiempo) {
      this.ultimoTiempo = this.video.currentTime;
      this.#procesar(this.detector.detectForVideo(this.video, performance.now()));
    }
    requestAnimationFrame(() => this.#ciclo());
  }

  #procesar(resultado) {
    const mano = resultado.landmarks?.[0];
    if (!mano) {
      if (this.habiaMano) {
        this.habiaMano = false;
        this.pinza = false;
        this.dispatchEvent(new CustomEvent('perdida'));
      }
      return;
    }
    this.habiaMano = true;
    const pulgar = mano[4];
    const indice = mano[8];
    // Se normaliza por el tamaño de la mano (muñeca a base del dedo medio)
    // para que no dependa de qué tan cerca esté de la cámara.
    const escala = distancia(mano[0], mano[9]) || 1e-6;
    const apertura = distancia(pulgar, indice) / escala;
    // Dos umbrales distintos para que la pinza no parpadee.
    if (!this.pinza && apertura < this.umbralCerrar) this.pinza = true;
    else if (this.pinza && apertura > this.umbralAbrir) this.pinza = false;

    this.dispatchEvent(
      new CustomEvent('mano', {
        detail: {
          x: 1 - (pulgar.x + indice.x) / 2,
          y: (pulgar.y + indice.y) / 2,
          pinza: this.pinza,
          apertura,
        },
      }),
    );
  }

  detener() {
    this.activo = false;
    this.video.srcObject?.getTracks().forEach((pista) => pista.stop());
    this.detector?.close();
  }
}
