import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const ruta = (relativa) => fileURLToPath(new URL(relativa, import.meta.url));

// El código del navegador vive en client/. En desarrollo Vite corre dentro de Express;
// en producción `npm run build` deja los archivos en public/build con su manifest.
export default defineConfig(({ command }) => ({
  root: ruta('./client'),
  base: command === 'build' ? '/build/' : '/',
  build: {
    outDir: ruta('./public/build'),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        main: ruta('./client/main.js'),
        diagnostico: ruta('./client/pages/diagnostico.js'),
        practica: ruta('./client/pages/practica.js'),
        perfil: ruta('./client/pages/perfil.js'),
        evaluacion: ruta('./client/pages/evaluacion.js'),
        tablero: ruta('./client/pages/tablero.js'),
        autobus: ruta('./client/pages/autobus.js'),
        escenario: ruta('./client/pages/escenario.js'),
        taller: ruta('./client/pages/taller.js'),
        aprender: ruta('./client/pages/aprender.js'),
        leccion: ruta('./client/pages/leccion.js'),
        recorrido: ruta('./client/pages/recorrido.js'),
        entrar: ruta('./client/pages/entrar.js'),
        gafetes: ruta('./client/pages/gafetes.js'),
      },
    },
  },
}));
