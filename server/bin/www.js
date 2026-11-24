import http from 'node:http';
import app from '../app.js';

const port = Number(process.env.PORT) || 3000;
app.set('port', port);

const server = http.createServer(app);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${port} ya está en uso`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, () => {
  console.log(`Servidor en http://localhost:${port}`);
});
