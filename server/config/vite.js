import path from 'node:path';
import express from 'express';

// En desarrollo monta Vite como middleware (recarga en caliente de client/).
// En producción sirve lo que dejó `npm run build` en public/build.
export async function configurarVite(app) {
  if (process.env.NODE_ENV === 'production') {
    app.use('/build', express.static(path.resolve('public', 'build'), { immutable: true, maxAge: '1y' }));
    return;
  }
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: path.resolve('vite.config.js'),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
}
