// Copiado de guante/web (equipo de hardware).
/* eslint-disable no-await-in-loop */
// Lee el guante (ESP32) por USB con Web Serial. Solo Chrome o Edge,
// en localhost o https. conectar() debe llamarse desde un clic.
// Eventos: 'dato' (lectura JSON), 'estado' ({ conectado }).

export class SerialGlove extends EventTarget {
  constructor({ baudRate = 115200 } = {}) {
    super();
    this.baudRate = baudRate;
    this.port = null;
    this.reader = null;
    this.cierre = null;
    this.conectado = false;
  }

  static get disponible() {
    return 'serial' in navigator;
  }

  async conectar() {
    if (!SerialGlove.disponible) throw new Error('Este navegador no tiene Web Serial. Usa Chrome o Edge.');
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baudRate });
    this.#cambiarEstado(true);
    this.#leer();
  }

  async #leer() {
    const decoder = new TextDecoderStream();
    this.cierre = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += value;
        let fin = buffer.indexOf('\n');
        while (fin >= 0) {
          const linea = buffer.slice(0, fin).trim();
          buffer = buffer.slice(fin + 1);
          if (linea.startsWith('{')) {
            try {
              this.dispatchEvent(new CustomEvent('dato', { detail: JSON.parse(linea) }));
            } catch {
              // línea incompleta o corrupta: se ignora
            }
          }
          fin = buffer.indexOf('\n');
        }
      }
    } catch {
      // el cable se desconectó o el puerto se cerró
    } finally {
      this.reader.releaseLock();
      this.#cambiarEstado(false);
    }
  }

  // Comandos del firmware: 'Z' recentrar, 'C' calibrar, 'B' pitido, '1'/'0' LED.
  async enviar(comando) {
    if (!this.port?.writable) return;
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(comando));
    } finally {
      writer.releaseLock();
    }
  }

  async desconectar() {
    try {
      await this.reader?.cancel();
      await this.cierre;
      await this.port?.close();
    } catch {
      // ya estaba cerrado
    }
    this.#cambiarEstado(false);
  }

  #cambiarEstado(conectado) {
    if (this.conectado === conectado) return;
    this.conectado = conectado;
    this.dispatchEvent(new CustomEvent('estado', { detail: { conectado } }));
  }
}
