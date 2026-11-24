import http from 'node:http';
import app from '#app';
import logger from '#config/logger.js';

const port = Number(process.env.PORT) || 3000;
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
