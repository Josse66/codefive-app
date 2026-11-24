import { Server } from 'socket.io';
import logger from '#config/logger.js';

// Canal en vivo del tablero de Volvo con Socket.IO, sobre el mismo servidor HTTP de Express.
// Los servicios llaman a avisar() y cada tablero abierto recibe el aviso al instante.
let io = null;

export function conectarEnVivo(servidorHttp) {
  io = new Server(servidorHttp, { serveClient: false });
  io.on('connection', (socket) => {
    logger.debug(`Tablero conectado (${io.engine.clientsCount} abiertos)`);
    socket.on('disconnect', () => logger.debug('Tablero desconectado'));
  });
  return io;
}

/** Avisa a los tableros abiertos. Si el canal no está activo (pruebas, scripts), no hace nada. */
export function avisar(tipo, datos = {}) {
  io?.emit(tipo, datos);
}
