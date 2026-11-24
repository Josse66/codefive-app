// Copiado de guante/web (equipo de hardware). Cambio: solo el clic izquierdo cuenta como agarre.
/* eslint-disable no-restricted-syntax */
// Junta mouse, cámara y guante en un solo flujo de eventos para la escena 3D.
// La escena escucha este bus y nunca a los dispositivos directo.
//
// Reglas:
//   posición (x, y): cámara si hay mano; si no, mouse
//   giro (roll, pitch, yaw): guante si está conectado
//   agarre: botón del guante O pinza de la cámara O clic del mouse
//
// Eventos: 'pose', 'grab', 'release' con detail = { source, x, y, roll, pitch, yaw, gmag, grip }
//          'fuentes' con detail = { mouse, camara, guante } cuando una se activa o se pierde

const SIN_DATOS_MS = 1000;

export class InputBus extends EventTarget {
  constructor() {
    super();
    this.estado = { x: 0.5, y: 0.5, roll: 0, pitch: 0, yaw: 0, gmag: 0, grip: false };
    this.agarres = { mouse: false, camara: false, guante: false };
    this.ultimoDato = { camara: 0, guante: 0 };
    this.fuentes = { mouse: true, camara: false, guante: false };
    setInterval(() => this.#revisarFuentes(), 250);
  }

  conectarMouse(elemento) {
    const posicion = (e) => {
      const r = elemento.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    elemento.addEventListener('pointermove', (e) => {
      if (this.fuentes.camara) return;
      this.#actualizar('mouse', posicion(e));
    });
    elemento.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // el clic derecho gira la vista 3D
      this.#actualizar('mouse', this.fuentes.camara ? {} : posicion(e));
      this.#agarre('mouse', true);
    });
    window.addEventListener('pointerup', () => this.#agarre('mouse', false));
  }

  conectarCamara(tracker) {
    tracker.addEventListener('mano', ({ detail }) => {
      this.ultimoDato.camara = performance.now();
      this.#marcarFuente('camara', true);
      this.#actualizar('camara', { x: detail.x, y: detail.y });
      this.#agarre('camara', detail.pinza);
    });
    tracker.addEventListener('perdida', () => this.#agarre('camara', false));
  }

  conectarGuante(guante) {
    guante.addEventListener('dato', ({ detail }) => {
      if (detail.tipo) return; // mensajes de estado del firmware
      this.ultimoDato.guante = performance.now();
      this.#marcarFuente('guante', true);
      this.#actualizar('guante', {
        roll: detail.roll,
        pitch: detail.pitch,
        yaw: detail.yaw,
        gmag: detail.gmag,
      });
      this.#agarre('guante', detail.grip === 1);
    });
    guante.addEventListener('estado', ({ detail }) => {
      if (!detail.conectado) {
        this.#agarre('guante', false);
        this.#marcarFuente('guante', false);
      }
    });
  }

  #actualizar(source, datos) {
    Object.assign(this.estado, datos);
    this.#emitir('pose', source);
  }

  #agarre(source, activo) {
    if (this.agarres[source] === activo) return;
    this.agarres[source] = activo;
    const grip = Object.values(this.agarres).some(Boolean);
    if (grip === this.estado.grip) return;
    this.estado.grip = grip;
    this.#emitir(grip ? 'grab' : 'release', source);
  }

  #emitir(tipo, source) {
    this.dispatchEvent(new CustomEvent(tipo, { detail: { ...this.estado, source } }));
  }

  #marcarFuente(nombre, activa) {
    if (this.fuentes[nombre] === activa) return;
    this.fuentes[nombre] = activa;
    this.dispatchEvent(new CustomEvent('fuentes', { detail: { ...this.fuentes } }));
  }

  // Si una fuente deja de mandar datos, se suelta lo que tenía agarrado
  // y el control vuelve al mouse.
  #revisarFuentes() {
    const ahora = performance.now();
    for (const nombre of ['camara', 'guante']) {
      if (this.fuentes[nombre] && ahora - this.ultimoDato[nombre] > SIN_DATOS_MS) {
        this.#agarre(nombre, false);
        this.#marcarFuente(nombre, false);
      }
    }
  }
}
