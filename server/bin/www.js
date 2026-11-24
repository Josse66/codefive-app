import http from 'node:http';
import { crearApp } from '#app';
import logger from '#config/logger.js';
import db from '#db/conexion.js';
import { baseVacia, sembrar } from '#db/semilla.js';

// La primera vez que corre en una laptop, la base se llena sola.
if (baseVacia(db)) sembrar(db);

const port = Number(process.env.PORT) || 3000;
const app = await crearApp();
app.set('port', port);

const server = http.createServer(app);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`El puerto ${port} ya está en uso`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, () => {
  logger.info(`Servidor en http://localhost:${port}`);
});
