import express from 'express';
import morgan from 'morgan';
import { streamHttp } from '#config/logger.js';

const app = express();

// Formato sin colores para que los archivos de log queden limpios.
app.use(morgan(':method :url :status :response-time ms', { stream: streamHttp }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/', (_req, res) => {
  res.send('CodeFive · Técnicos del Mañana');
});

app.get('/api/salud', (_req, res) => {
  res.json({ ok: true, servicio: 'codefive-app' });
});

export default app;
