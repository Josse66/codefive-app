import path from 'node:path';
import express from 'express';
import morgan from 'morgan';
import logger, { streamHttp } from '#config/logger.js';
import { configurarHandlebars } from '#config/handlebars.js';
import { configurarVite } from '#config/vite.js';
import webRoutes from '#routes/web.routes.js';
import apiRoutes from '#routes/api.routes.js';

const enDesarrollo = process.env.NODE_ENV !== 'production';

export async function crearApp() {
  const app = express();

  configurarHandlebars(app);

  // Formato sin colores para que los archivos de log queden limpios.
  app.use(morgan(':method :url :status :response-time ms', { stream: streamHttp }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await configurarVite(app);
  app.use(express.static(path.resolve('public')));

  app.use('/', webRoutes);
  app.use('/api', apiRoutes);

  // 404: ninguna ruta respondió.
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'No encontrado' });
      return;
    }
    res.status(404).render('404', { titulo: 'No encontrado', ruta: req.originalUrl });
  });

  // Manejador de errores: registra en Winston y responde según el tipo de ruta.
  app.use((err, req, res, _next) => {
    const estado = err.status ?? 500;
    logger.error(err);
    if (req.path.startsWith('/api/')) {
      res.status(estado).json({ error: estado === 500 ? 'Error interno' : err.message });
      return;
    }
    res.status(estado).render('error', {
      titulo: 'Error',
      mensaje: estado === 500 ? 'Error interno del servidor.' : err.message,
      detalle: enDesarrollo ? err.stack : null,
    });
  });

  return app;
}
