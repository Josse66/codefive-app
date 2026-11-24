import path from 'node:path';
import { engine } from 'express-handlebars';
import { viteAssets } from '#helpers/viteAssets.js';
import * as formato from '#helpers/formato.js';

const carpetaVistas = path.resolve('server', 'views');

export function configurarHandlebars(app) {
  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir: path.join(carpetaVistas, 'layouts'),
      partialsDir: path.join(carpetaVistas, 'partials'),
      helpers: {
        anio: () => new Date().getFullYear(),
        igual: (a, b) => a === b,
        inc: (n) => Number(n) + 1,
        viteAssets,
        ...formato,
      },
    }),
  );
  app.set('view engine', 'hbs');
  app.set('views', carpetaVistas);
}
