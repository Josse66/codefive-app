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
      },
    },
  },
}));
