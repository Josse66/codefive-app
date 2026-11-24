import http from 'node:http';
import { crearApp } from '#app';
import logger from '#config/logger.js';
import { conectarEnVivo } from '#config/envivo.js';
import db from '#db/conexion.js';
import { sembrar, sembrarEvaluacion } from '#db/semilla.js';

// La base se llena sola la primera vez y recibe el contenido nuevo en cada arranque.
sembrar(db);
sembrarEvaluacion(db);

const port = Number(process.env.PORT) || 3000;
const app = await crearApp();
app.set('port', port);

const server = http.createServer(app);
conectarEnVivo(server);

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
