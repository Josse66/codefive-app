import fs from 'node:fs';
import path from 'node:path';

const enDesarrollo = process.env.NODE_ENV !== 'production';
const rutaManifest = path.resolve('public', 'build', '.vite', 'manifest.json');
let manifest = null;

function leerManifest() {
  if (!manifest) {
    if (!fs.existsSync(rutaManifest)) {
      throw new Error(
        'No existe public/build/.vite/manifest.json. Corre "npm run build" antes de "npm start".',
      );
    }
    manifest = JSON.parse(fs.readFileSync(rutaManifest, 'utf8'));
  }
  return manifest;
}

// Devuelve las etiquetas <script> y <link> de una entrada de Vite (por ejemplo 'main.js').
// En desarrollo apunta al servidor de Vite; en producción usa los archivos con hash del build.
export function viteAssets(entrada) {
  if (enDesarrollo) {
    return `<script type="module" src="/@vite/client"></script>\n<script type="module" src="/${entrada}"></script>`;
  }
  const chunk = leerManifest()[entrada];
  if (!chunk) throw new Error(`La entrada "${entrada}" no está en el manifest de Vite`);
  const estilos = (chunk.css ?? []).map((archivo) => `<link rel="stylesheet" href="/build/${archivo}">`);
  return [...estilos, `<script type="module" src="/build/${chunk.file}"></script>`].join('\n');
}
