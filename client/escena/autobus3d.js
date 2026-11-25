// Escena 3D del autobús con Three.js, dibujada como la lámina del manual: carrocería gris claro con
// aristas en tinta, recuadros numerados por grupo de función y naranja solo para alto voltaje.
// La usan la exploración por grupos y los escenarios de práctica.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const COLOR = {
  papel: 0xeef1f3,
  carroceria: 0xf7f8f9,
  tinta: 0x141c24,
  linea: 0xc9d1d8,
  vidrio: 0x55616c,
  llanta: 0x33404c,
  hv: 0xd9480f,
  hvSuave: 0xfbe9df,
  aire: 0x3b6e8f,
  caliente: 0xc98a00,
  metal: 0x8a959f,
  ok: 0x2f7d43,
  mal: 0xb3121f,
};

const COLOR_PIEZA = {
  hv: COLOR.hv,
  aire: COLOR.aire,
  caliente: COLOR.caliente,
  metal: COLOR.metal,
  tablero: COLOR.tinta,
  medicion: COLOR.hv,
  equipo: COLOR.llanta,
  deposito: COLOR.metal,
  rueda: COLOR.llanta,
  carroceria: COLOR.carroceria,
};

// Recuadro de referencia de cada grupo sobre el autobús (lado derecho, +z).
export const POSICION_GRUPO = {
  0: [5.6, 2.7, 1.45],
  1: [5.6, 1.0, 1.45],
  2: [-5.5, 1.1, 1.45],
  3: [0, 3.95, 0.4],
  4: [-2.6, 0.55, 1.6],
  5: [-3.8, 1.35, 1.6],
  6: [4.1, 1.35, 1.6],
  7: [-1.2, 0.3, 1.6],
  8: [2.4, 2.25, 1.45],
  9: [-5.5, 2.3, 1.45],
};

function conAristas(malla, color = COLOR.tinta) {
  const aristas = new THREE.LineSegments(
    new THREE.EdgesGeometry(malla.geometry, 25),
    new THREE.LineBasicMaterial({ color }),
  );
  malla.add(aristas);
  return malla;
}

function caja([ancho, alto, fondo], color, [x, y, z]) {
  const malla = new THREE.Mesh(
    new THREE.BoxGeometry(ancho, alto, fondo),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }),
  );
  malla.position.set(x, y, z);
  return conAristas(malla);
}

function rueda(x, z) {
  const grupo = new THREE.Group();
  const llanta = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 0.34, 28),
    new THREE.MeshStandardMaterial({ color: COLOR.llanta, roughness: 0.9 }),
  );
  llanta.rotation.x = Math.PI / 2;
  const rin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.36, 20),
    new THREE.MeshStandardMaterial({ color: COLOR.metal }),
  );
  rin.rotation.x = Math.PI / 2;
  grupo.add(conAristas(llanta), rin);
  grupo.position.set(x, 0.52, z);
  return grupo;
}

// Etiqueta en cuadro de tinta, como los recuadros de referencia de la lámina.
function etiqueta(texto, { fondo = '#141c24', tinta = '#ffffff', tamano = 0.42 } = {}) {
  const lienzo = document.createElement('canvas');
  // Textos largos ("600 V") usan un lienzo del doble de ancho.
  const ancho = texto.length > 2 ? 256 : 128;
  lienzo.width = ancho;
  lienzo.height = 128;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ancho, 128);
  ctx.fillStyle = tinta;
  ctx.font = 'bold 84px "Archivo Narrow", Archivo, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, ancho / 2, 70);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, depthTest: false }));
  sprite.scale.set((tamano * ancho) / 128, tamano, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// Modelo realista del autobús (GLB hecho en Blender, 12 m de largo, frente hacia +x, puerta en +z).
// Es el autobús urbano diésel completo: carrocería, interior, motor, transmisión, frenos,
// suspensión, sistema eléctrico. Cada pieza que se aprende es un nodo "p_<id>".
// Se descarga una sola vez y cada escena usa una copia.
const RUTA_MODELO = '/modelos/autobus_diesel.glb';
// Quien pide menos movimiento ve la cámara llegar sin vuelo.
const menosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let modeloCargando = null;
function cargarModelo() {
  modeloCargando ??= new GLTFLoader().loadAsync(RUTA_MODELO).then((gltf) => gltf.scene);
  return modeloCargando;
}

// Piezas, herramientas, baterías del techo y escape, modelados en Blender en un solo GLB.
// Cada uno es un nodo con el id de la pieza (las herramientas llevan "h_" adelante).
let bibliotecaCargando = null;
function cargarBiblioteca() {
  bibliotecaCargando ??= new GLTFLoader().loadAsync('/modelos/piezas.glb').then((gltf) => gltf.scene);
  return bibliotecaCargando;
}

// Luz del taller (HDRI CC0 de Poly Haven) y piso de concreto pintado.
let ambienteCargando = null;
function cargarAmbiente() {
  ambienteCargando ??= new HDRLoader().loadAsync('/modelos/taller_1k.hdr').then((textura) => {
    const t = textura;
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
  return ambienteCargando;
}
const cargadorTexturas = new THREE.TextureLoader();

// Piezas y herramientas del despiece de frenos hechas con geometría de Three.js (el frente mira a +z).
// Se usan cuando la biblioteca de Blender no trae el modelo.
const MATERIAL = {
  acero: () => new THREE.MeshStandardMaterial({ color: 0x8e959c, metalness: 1, roughness: 0.35 }),
  negro: () => new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.3, roughness: 0.5 }),
  oxido: () => new THREE.MeshStandardMaterial({ color: 0x6b4a2f, metalness: 0.5, roughness: 0.7 }),
  amarillo: () => new THREE.MeshStandardMaterial({ color: 0xe0a800, roughness: 0.5 }),
  rojo: () => new THREE.MeshStandardMaterial({ color: 0x9a1414, roughness: 0.45 }),
};
function pieza3d(geometria, material, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
  const m = new THREE.Mesh(geometria, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
const deFrente = [Math.PI / 2, 0, 0]; // cilindro con su eje hacia +z
const PROCEDURALES = {
  tuercas_rueda: () => {
    const g = new THREE.Group();
    g.add(pieza3d(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 40), MATERIAL.acero(), [0, 0, 0], deFrente));
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2;
      g.add(
        pieza3d(
          new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6),
          MATERIAL.acero(),
          [0.12 * Math.cos(a), 0.12 * Math.sin(a), 0.035],
          deFrente,
        ),
      );
    }
    g.add(
      pieza3d(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 24), MATERIAL.negro(), [0, 0, 0.03], deFrente),
    );
    return g;
  },
  tambor_freno: () => {
    const g = new THREE.Group();
    g.add(pieza3d(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 48), MATERIAL.negro(), [0, 0, 0], deFrente));
    g.add(
      pieza3d(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 32), MATERIAL.acero(), [0, 0, 0.12], deFrente),
    );
    return g;
  },
  balatas: () => {
    const g = new THREE.Group();
    g.add(
      pieza3d(new THREE.CylinderGeometry(0.27, 0.27, 0.015, 48), MATERIAL.acero(), [0, 0, -0.05], deFrente),
    );
    [0, Math.PI].forEach((giro) => {
      g.add(
        pieza3d(
          new THREE.TorusGeometry(0.22, 0.035, 8, 32, Math.PI * 0.8),
          MATERIAL.oxido(),
          [0, 0, 0],
          [0, 0, giro + Math.PI * 0.1],
        ),
      );
    });
    return g;
  },
  punto_gato: () => {
    const g = new THREE.Group();
    g.add(
      pieza3d(
        new THREE.CylinderGeometry(0.07, 0.07, 0.5, 24),
        MATERIAL.negro(),
        [0, 0.05, 0],
        [0, 0, Math.PI / 2],
      ),
    );
    g.add(pieza3d(new THREE.BoxGeometry(0.16, 0.06, 0.16), MATERIAL.acero(), [0, -0.03, 0]));
    return g;
  },
  h_llave: () => {
    const g = new THREE.Group();
    g.add(pieza3d(new THREE.BoxGeometry(0.07, 0.16, 0.06), MATERIAL.amarillo(), [0, 0.04, 0]));
    g.add(
      pieza3d(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 24), MATERIAL.negro(), [0, 0.1, -0.09], deFrente),
    );
    g.add(
      pieza3d(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 6), MATERIAL.acero(), [0, 0.1, -0.19], deFrente),
    );
    return g;
  },
  h_gato: () => {
    const g = new THREE.Group();
    g.add(pieza3d(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 24), MATERIAL.rojo()));
    g.add(pieza3d(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 24), MATERIAL.acero(), [0, 0.14, 0]));
    g.add(pieza3d(new THREE.BoxGeometry(0.16, 0.02, 0.14), MATERIAL.rojo(), [0, -0.1, 0]));
    return g;
  },
  h_calibrador: () => {
    const g = new THREE.Group();
    g.add(pieza3d(new THREE.BoxGeometry(0.02, 0.22, 0.004), MATERIAL.acero()));
    g.add(pieza3d(new THREE.BoxGeometry(0.05, 0.012, 0.006), MATERIAL.acero(), [0.02, 0.1, 0]));
    g.add(pieza3d(new THREE.BoxGeometry(0.05, 0.012, 0.006), MATERIAL.acero(), [0.02, 0.03, 0]));
    return g;
  },
  h_torquimetro: () => {
    const g = new THREE.Group();
    g.add(pieza3d(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 16), MATERIAL.acero()));
    g.add(pieza3d(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 16), MATERIAL.negro(), [0, -0.15, 0]));
    g.add(
      pieza3d(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 24), MATERIAL.acero(), [0, 0.21, 0], deFrente),
    );
    return g;
  },
};
const modeloDe = (biblioteca, nombre) =>
  biblioteca.getObjectByName(nombre) ?? PROCEDURALES[nombre]?.() ?? null;

// Copia de un modelo con materiales propios (para poder resaltarla sin tocar las demás) y sombras.
// Nombre de la tarjeta de video ("" si el navegador no lo da).
function nombreGpu(renderer) {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
}

function copiaDe(original) {
  const copia = original.clone(true);
  copia.position.set(0, 0, 0);
  copia.traverse((nodo) => {
    const n = nodo;
    if (n.isMesh) {
      n.material = n.material.clone();
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
  return copia;
}

// `compilar(objeto)` prepara los shaders antes de mostrar el modelo (sin trabar la página).
function construirAutobus(tipo, alCargar = () => {}, compilar = () => Promise.resolve()) {
  const bus = new THREE.Group();
  // Autobús de bloques: se ve mientras carga el modelo y se queda si el modelo no carga.
  const bloques = new THREE.Group();
  bus.add(bloques);
  // Carrocería.
  bloques.add(caja([12, 2.8, 2.5], COLOR.carroceria, [0, 1.85, 0]));
  // Banda de ventanas a los dos lados y parabrisas.
  [1.26, -1.26].forEach((z) => {
    for (let x = -4.6; x <= 3.4; x += 1.6) {
      bloques.add(caja([1.4, 0.95, 0.02], COLOR.vidrio, [x, 2.45, z]));
    }
  });
  bloques.add(caja([0.02, 1.4, 2.2], COLOR.vidrio, [6.01, 2.3, 0]));
  // Puertas del lado derecho.
  bloques.add(caja([1.1, 2.4, 0.03], 0xe3e8ec, [5.0, 1.65, 1.27]));
  bloques.add(caja([1.2, 2.4, 0.03], 0xe3e8ec, [0.6, 1.65, 1.27]));
  // Defensa y faldón.
  bloques.add(caja([12.1, 0.18, 2.55], COLOR.llanta, [0, 0.5, 0]));
  // Ruedas.
  [-3.8, 4.1].forEach((x) => [1.1, -1.1].forEach((z) => bloques.add(rueda(x, z))));
  // Compartimiento del motor atrás en el diésel.
  if (tipo === 'diesel') bloques.add(caja([0.03, 1.1, 2.0], 0xe3e8ec, [-6.01, 1.25, 0]));

  // Cuando llega el modelo realista, sustituye a los bloques.
  cargarModelo()
    .then((modelo) => {
      const copia = copiaDe(modelo);
      copia.children.forEach((parte) => {
        const p = parte;
        if (p.name === 'sombra_piso') {
          // Sombra horneada en Blender (blanco = sombra): plano negro que la usa como transparencia.
          const textura = p.material.map;
          p.material = new THREE.MeshBasicMaterial({
            color: 0x000000,
            alphaMap: textura,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
          });
          p.position.y = 0.006;
          p.castShadow = false;
          p.receiveShadow = false;
          p.renderOrder = -1;
          return;
        }
        // La carrocería ya trae su luz horneada (oclusión ambiental) y su sombra en el piso:
        // ya no proyecta sombras en tiempo real, que era lo más pesado de la escena.
        p.traverse((n) => {
          const nodo = n;
          // Tampoco recibe: cada píxel del autobús leía el mapa de sombras sin que se notara.
          if (nodo.isMesh) Object.assign(nodo, { castShadow: false, receiveShadow: false });
        });
      });
      return compilar(copia)
        .catch(() => {})
        .then(() => {
          bus.remove(bloques);
          bus.add(copia);
          alCargar(copia);
        });
    })
    .catch(() => {});
  return bus;
}

/**
 * Crea la escena en un contenedor.
 * @param {HTMLElement} contenedor
 * @param {{ autobus: 'electrico'|'diesel', piezas?: any[], enfoque?: {objetivo, distancia}, grupos?: boolean }} opciones
 */
// completo: las piezas del modelo (nodos "p_<id>") se pueden señalar; catalogo(id) da su ficha.
export function crearEscena(
  contenedor,
  { autobus, piezas = [], enfoque, grupos = false, completo = false, catalogo = null },
) {
  // Calidad: "normal" (sombras, resolución hasta 1.5) o "ligero" (sin sombras, resolución 1).
  // Se guarda en el navegador; si la computadora va lenta se cambia sola a ligero.
  let calidad = localStorage.getItem('calidad3d') ?? 'normal';
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // PCF simple: la sombra del autobús ya viene horneada; la suave costaba muchas lecturas por píxel.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.enabled = (localStorage.getItem('calidad3d') ?? 'normal') === 'normal';
  // Las sombras no cambian solas: se recalculan solo cuando algo se carga o se mueve.
  renderer.shadowMap.autoUpdate = false;
  contenedor.append(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  // Se dibuja solo cuando algo cambia (cámara, carga, animación o puntero), no 60 veces por segundo.
  let pendiente = true;
  const pedirCuadro = (sombras = false) => {
    pendiente = true;
    if (sombras) renderer.shadowMap.needsUpdate = true;
  };

  const escena = new THREE.Scene();
  // Fondo liso del color del taller con neblina para que el piso se pierda en el horizonte.
  escena.background = new THREE.Color(0xd3d8dc);
  escena.fog = new THREE.Fog(0xd3d8dc, 28, 60);
  escena.add(new THREE.HemisphereLight(0xffffff, 0x8a959f, 0.6));
  // Lámpara del techo del taller: da las sombras del autobús y las piezas sobre el piso.
  const sol = new THREE.DirectionalLight(0xffffff, 1.8);
  sol.position.set(4, 14, 7);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  Object.assign(sol.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sol.shadow.bias = -0.0005;
  escena.add(sol);

  // Piso de concreto gris del taller (solo el relieve de la textura) con las líneas amarillas de la bahía.
  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0xaab1b7, roughness: 0.82 }),
  );
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  escena.add(piso);
  cargadorTexturas
    .loadAsync('/modelos/piso_normal.jpg')
    .then((normal) => {
      const t = normal;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(24, 24);
      t.anisotropy = 8;
      piso.material.normalMap = t;
      piso.material.normalScale.set(0.6, 0.6);
      piso.material.needsUpdate = true;
      pedirCuadro();
    })
    .catch(() => {});
  [-2.4, 2.4].forEach((z) => {
    const linea = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xe0a800, roughness: 0.7 }),
    );
    linea.rotation.x = -Math.PI / 2;
    linea.position.set(0, 0.005, z);
    linea.receiveShadow = true;
    escena.add(linea);
  });

  // El HDRI solo da los reflejos de taller a los metales (de fondo cuesta mucho).
  cargarAmbiente()
    .then((textura) => {
      escena.environment = textura;
      escena.environmentIntensity = 0.9;
      pedirCuadro();
    })
    .catch(() => {});

  // Resolución dinámica (como en los juegos): el costo de la GPU crece con los píxeles, así que
  // se limita el total de píxeles y, si los cuadros tardan, se baja la escala sola; si sobra
  // tiempo, se sube poco a poco. Así la pantalla completa no traba una GPU integrada.
  // Con GPU integrada (la de la mayoría de las laptops) el tope de píxeles es menor.
  const integrada = /intel|integrated|radeon\(tm\) graphics|uhd|iris|mali|adreno/i.test(nombreGpu(renderer));
  const PIXELES_MAX = integrada ? { normal: 1.1e6, ligero: 0.8e6 } : { normal: 2.4e6, ligero: 1.2e6 };
  const resolucion = { escala: 1, promedio: 1 / 60, cuenta: 0, holgura: 0, bajadas: 0 };
  function ajustarResolucion() {
    const { clientWidth: ancho, clientHeight: alto } = contenedor;
    if (!ancho || !alto) return;
    const tope = Math.min(window.devicePixelRatio, calidad === 'normal' ? 1.5 : 1);
    const porPixeles = Math.sqrt(PIXELES_MAX[calidad] / (ancho * alto));
    const dpr = Math.max(0.5, Math.min(tope, porPixeles) * resolucion.escala);
    if (Math.abs(renderer.getPixelRatio() - dpr) > 0.01) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(ancho, alto, false);
    }
  }
  // Se llama con la duración de cada cuadro dibujado seguido de otro (cámara moviéndose).
  // Promedio móvil del tiempo por cuadro; se revisa cada 20 cuadros dibujados.
  function vigilarCuadro(dt) {
    resolucion.promedio = resolucion.promedio * 0.9 + Math.min(dt, 0.2) * 0.1;
    resolucion.cuenta += 1;
    if (resolucion.cuenta < 20) return;
    resolucion.cuenta = 0;
    if (resolucion.promedio > 1 / 45 && resolucion.escala > 0.55) {
      resolucion.escala = Math.max(0.55, resolucion.escala * 0.85);
      resolucion.holgura = 0;
      resolucion.bajadas += 1;
      ajustarResolucion();
    } else if (resolucion.promedio < 1 / 57 && resolucion.escala < 1 && resolucion.bajadas < 3) {
      // Sube solo tras varios chequeos holgados seguidos y deja de subir si ya bajó 3 veces:
      // cada cambio de tamaño cuesta un cuadro, así que no debe oscilar.
      resolucion.holgura += 1;
      if (resolucion.holgura >= 8) {
        resolucion.escala = Math.min(1, resolucion.escala * 1.1);
        resolucion.holgura = 0;
        ajustarResolucion();
      }
    } else {
      resolucion.holgura = 0;
    }
  }

  // Aplica la calidad: resolución y sombras. Cambiar las sombras obliga a recompilar materiales.
  function aplicarCalidad() {
    const normal = calidad === 'normal';
    resolucion.escala = 1;
    ajustarResolucion();
    if (renderer.shadowMap.enabled !== normal) {
      renderer.shadowMap.enabled = normal;
      escena.traverse((n) => {
        if (n.material) Object.assign(n.material, { needsUpdate: true });
      });
    }
    pedirCuadro(true);
  }

  const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const objetivo = new THREE.Vector3(...(enfoque?.objetivo ?? [0, 1.6, 0]));
  const distancia = enfoque?.distancia ?? 9;
  // La cámara mira desde el lado derecho, un poco arriba y adelante; distancia es la del JSON.
  const direccion = new THREE.Vector3(0.35, 0.5, 1).normalize();
  camara.position.copy(objetivo).addScaledVector(direccion, distancia * 1.6);
  // Entrada: la cámara llega desde lejos y de lado hasta su lugar.
  // El mismo vuelo sirve para enfocar una pieza después (mueve cámara y punto de mira).
  const llegada = {
    t: 0,
    duracion: menosMovimiento ? 0.01 : 1.8,
    desde: objetivo.clone().addScaledVector(new THREE.Vector3(1.1, 0.7, 0.9).normalize(), distancia * 3.2),
    hasta: camara.position.clone(),
    miraDesde: objetivo.clone(),
    miraHasta: objetivo.clone(),
  };
  camara.position.copy(llegada.desde);
  const controles = new OrbitControls(camara, renderer.domElement);
  controles.addEventListener('start', () => {
    llegada.t = 1;
  });
  controles.addEventListener('change', () => pedirCuadro());
  controles.enableDamping = true;
  controles.target.copy(objetivo);
  // Clic izquierdo = usar la herramienta o elegir; derecho gira la vista; la rueda acerca.
  controles.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controles.enablePan = false;
  controles.minDistance = 3;
  controles.maxDistance = completo ? 16 : 34;
  controles.maxPolarAngle = Math.PI * 0.49;
  controles.update();

  // compileAsync usa la compilación en paralelo del navegador: el modelo aparece ya listo
  // en vez de congelar la página medio segundo en su primer cuadro.
  const compilar = (objeto) => renderer.compileAsync(objeto, camara, escena);

  // Piezas del escenario: se pueden señalar y reciben herramientas.
  const mallasPieza = new Map();
  piezas.forEach((pieza) => {
    const malla =
      pieza.tipo === 'rueda'
        ? new THREE.Mesh(
            new THREE.CylinderGeometry(pieza.tamano[0] / 2, pieza.tamano[0] / 2, pieza.tamano[2], 24),
            new THREE.MeshStandardMaterial({ color: COLOR_PIEZA.rueda, transparent: true, opacity: 0.001 }),
          )
        : new THREE.Mesh(
            new THREE.BoxGeometry(...pieza.tamano),
            new THREE.MeshStandardMaterial({ color: COLOR_PIEZA[pieza.tipo] ?? COLOR.metal, roughness: 0.6 }),
          );
    if (pieza.tipo === 'rueda') {
      // Solo sirve para señalar: no se dibuja, pero el rayo la sigue encontrando.
      malla.rotation.x = Math.PI / 2;
      malla.material.visible = false;
    }
    malla.position.set(...pieza.pos);
    malla.userData.pieza = pieza;
    // La rueda es del modelo del autobús; su caja invisible no lleva aristas.
    if (pieza.tipo !== 'rueda') conAristas(malla);
    malla.castShadow = true;
    escena.add(malla);
    mallasPieza.set(pieza.id, malla);
  });

  // Cuando llega la biblioteca, cada caja se vuelve invisible (sigue sirviendo para señalar)
  // y adentro aparece la pieza modelada.
  cargarBiblioteca()
    .then((biblioteca) => {
      mallasPieza.forEach((malla, id) => {
        // Las piezas del autobús completo ya vienen modeladas (no son cajas).
        if (!malla.isMesh) return;
        const original = modeloDe(biblioteca, id);
        if (!original) return;
        const modelo = copiaDe(original);
        const m = malla;
        // La caja ya no se dibuja (sigue respondiendo al rayo para señalar la pieza).
        m.material.visible = false;
        m.castShadow = false;
        m.children.forEach((hijo) => {
          const h = hijo;
          if (h.isLineSegments) h.visible = false;
        });
        m.add(modelo);
        m.userData.modelo = modelo;
      });
      pedirCuadro(true);
    })
    .catch(() => {});

  // Tiñe la pieza (modelo o caja) con un color de brillo.
  function tenir(malla, hex, intensidad = 1) {
    const aplicar = (material) => {
      if (!material.emissive) return;
      material.emissive.setHex(hex);
      Object.assign(material, { emissiveIntensity: intensidad });
    };
    if (malla.userData.modelo) {
      malla.userData.modelo.traverse((n) => n.isMesh && aplicar(n.material));
    } else {
      aplicar(malla.material);
    }
  }

  // ---------- Autobús completo: cada nodo "p_<id>" del modelo es una pieza que se aprende ----------
  // La carrocería y la tapa del motor tapan lo de adentro (salvo con rayos X).
  const ocluyentes = [];
  let tapaMotor = null;
  // Rayos X: la carrocería se vuelve casi transparente para ver motor, bajos e interior.
  const rayosX = { activo: false };
  // Tapa trasera del motor: gira sobre su bisagra de arriba.
  const tapa = { t: 1, desde: 0, hasta: 0 };
  // Para señalar, la carrocería se aproxima con dos cajas invisibles (cabina y compartimiento del
  // motor): tapan igual que la malla real y el rayo cuesta casi nada (la malla tiene ~10 mil
  // triángulos). Con la tapa abierta, la caja del motor deja de tapar.
  const sinDibujar = new THREE.MeshBasicMaterial({ visible: false });
  const cajaCabina = new THREE.Mesh(new THREE.BoxGeometry(10.45, 2.88, 2.55), sinDibujar);
  cajaCabina.position.set(0.775, 1.76, 0);
  const cajaMotor = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.88, 2.55), sinDibujar);
  cajaMotor.position.set(-5.225, 1.76, 0);
  escena.add(cajaCabina, cajaMotor);
  const tapanRayo = () => (tapa.hasta !== 0 ? [cajaCabina] : [cajaCabina, cajaMotor]);
  // Lo que va encerrado en el compartimiento del motor (atrás, arriba del piso) no se ve con la
  // tapa cerrada y sin rayos X: no se dibuja. Ahorra ~80 llamadas de dibujo por cuadro.
  const enMotor = [];
  // Lo de abajo (tanques, ejes, bolsas de aire, líneas) queda tapado por el faldón: desde afuera
  // y sin rayos X tampoco se dibuja. Caminando sí, por si la persona se agacha a ver.
  const enBajos = [];
  const vista = { primeraPersona: false };
  function actualizarOcultos() {
    const seVeMotor = rayosX.activo || tapa.hasta !== 0;
    enMotor.forEach((n) => Object.assign(n, { visible: seVeMotor }));
    const seVeAbajo = rayosX.activo || vista.primeraPersona;
    enBajos.forEach((n) => Object.assign(n, { visible: seVeAbajo }));
  }

  // Un solo material "fantasma" para toda la carrocería: cambiar a rayos X es solo cambiar de
  // material (sin recompilar los de la carrocería, que trababa la página un instante).
  const fantasma = new THREE.MeshBasicMaterial({
    color: 0x9fb3c8,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  // Una malla diminuta fuera de la vista hace que el material se prepare al cargar.
  const precalentar = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), fantasma);
  precalentar.position.set(0, -50, 0);
  escena.add(precalentar);
  function verRayosX(encender) {
    rayosX.activo = encender;
    ocluyentes.forEach((o) =>
      o.traverse((n) => {
        if (!n.isMesh) return;
        const malla = n;
        malla.userData.materialOriginal ??= malla.material;
        malla.material = encender ? fantasma : malla.userData.materialOriginal;
      }),
    );
    actualizarOcultos();
  }

  function abrirTapa(abrir) {
    if (!tapaMotor) return;
    Object.assign(tapa, { t: 0, desde: tapaMotor.rotation.z, hasta: abrir ? -1.25 : 0 });
    actualizarOcultos();
  }

  function registrarModelo(copia) {
    const caja3 = new THREE.Box3();
    const centro = new THREE.Vector3();
    copia.updateMatrixWorld(true);
    copia.traverse((n) => {
      const nodo = n;
      if (nodo.name === 'carroceria' || nodo.name === 'tapa_motor') ocluyentes.push(nodo);
      if (nodo.name === 'tapa_motor') tapaMotor = nodo;
      if (nodo.name.startsWith('p_') && !nodo.name.includes('__')) {
        caja3.setFromObject(nodo).getCenter(centro);
        if (centro.x < -4.45 && centro.y > 0.45) enMotor.push(nodo);
        else if (centro.y < 0.9 && Math.abs(centro.z) < 1.15) enBajos.push(nodo);
      }
      // Solo el nodo de la pieza (sus mallas se llaman "p_<id>__<material>").
      if (!completo || !nodo.name.startsWith('p_') || nodo.name.includes('__')) return;
      const id = nodo.name.slice(2);
      const info = catalogo?.(id);
      if (!info) return;
      nodo.userData.pieza = { id, nombre: info.nombre, base: info.base };
      nodo.userData.modelo = nodo;
      mallasPieza.set(id, nodo);
    });
    actualizarOcultos();
    // Avisa a la página que ya puede pedir piezas.
    renderer.domElement.dispatchEvent(new CustomEvent('modelo-listo'));
  }
  const bus = construirAutobus(
    autobus,
    (copia) => {
      registrarModelo(copia);
      pedirCuadro(true);
    },
    compilar,
  );
  escena.add(bus);

  // Recuadros 1 a 9 para explorar por grupo de función.
  const recuadros = new Map();
  if (grupos) {
    Object.entries(POSICION_GRUPO).forEach(([grupo, posicion]) => {
      const sprite = etiqueta(grupo, { tamano: 0.55 });
      sprite.position.set(...posicion);
      sprite.userData.grupo = Number(grupo);
      escena.add(sprite);
      recuadros.set(Number(grupo), sprite);
    });
  }

  // Herramienta en la mano: sigue al puntero y gira con el guante.
  const herramienta = new THREE.Group();
  herramienta.visible = false;
  escena.add(herramienta);

  // ---------- Modo inmersivo: primera persona en el taller ----------
  // El cursor siempre se ve (no se "toma" el mouse, así Esc no saca de nada): clic derecho
  // sostenido mira alrededor, WASD camina, Shift se agacha y el clic izquierdo usa la herramienta
  // donde está el cursor. La herramienta va en la mano derecha y el guante en la izquierda.
  escena.add(camara);
  const OJOS = { parado: 1.65, agachado: 0.95 };
  const inmersivo = { activo: false, guardado: null, altura: OJOS.parado };
  const mirada = new THREE.Euler(0, 0, 0, 'YXZ');
  let mirando = false;
  renderer.domElement.addEventListener('contextmenu', (e) => {
    if (inmersivo.activo) e.preventDefault();
  });
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!inmersivo.activo || e.button !== 2) return;
    mirando = true;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button === 2) mirando = false;
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!inmersivo.activo || !mirando) return;
    mirada.setFromQuaternion(camara.quaternion);
    mirada.y -= e.movementX * 0.0035;
    mirada.x = THREE.MathUtils.clamp(mirada.x - e.movementY * 0.0035, -1.35, 1.35);
    camara.quaternion.setFromEuler(mirada);
    pedirCuadro();
  });
  const teclas = new Set();
  const manoIzquierda = new THREE.Group();
  manoIzquierda.position.set(-0.3, -0.22, -0.6);
  manoIzquierda.visible = false;
  camara.add(manoIzquierda);
  cargarBiblioteca()
    .then((biblioteca) => {
      const guante = biblioteca.getObjectByName('h_mano');
      if (!guante) return;
      const copia = copiaDe(guante);
      copia.scale.setScalar(1.6);
      copia.rotation.set(0.3, 0.4, 0.2);
      manoIzquierda.add(copia);
    })
    .catch(() => {});

  // El autobús ocupa x de −6.1 a 6.1 y z de −1.35 a 1.35: la persona no lo atraviesa.
  function fueraDelAutobus(p) {
    const margen = 0.35;
    const ax = 6.1 + margen;
    const az = 1.35 + margen;
    if (Math.abs(p.x) < ax && Math.abs(p.z) < az) {
      if (ax - Math.abs(p.x) < az - Math.abs(p.z)) Object.assign(p, { x: Math.sign(p.x || 1) * ax });
      else Object.assign(p, { z: Math.sign(p.z || 1) * az });
    }
    Object.assign(p, { x: THREE.MathUtils.clamp(p.x, -14, 14), z: THREE.MathUtils.clamp(p.z, -9, 9) });
  }

  // Autobús completo: se entra caminando por la puerta delantera (lado +z) y adentro
  // se camina por el pasillo, con los ojos a la altura del piso del autobús.
  const PUERTA = { x0: 4.9, x1: 5.75 };
  const PISO_DENTRO = 0.42;
  function limitarPaso(p) {
    const enPuerta = p.x > PUERTA.x0 && p.x < PUERTA.x1;
    if (inmersivo.dentro) {
      if (enPuerta && p.z > 1.2) {
        inmersivo.dentro = false;
        return;
      }
      Object.assign(p, {
        x: THREE.MathUtils.clamp(p.x, -4.3, 5.6),
        z: THREE.MathUtils.clamp(p.z, -1.0, enPuerta ? 1.3 : 1.0),
      });
      return;
    }
    // Afuera, frente a la puerta abierta: se puede pasar.
    if (completo && enPuerta && p.z > 0.5 && p.z < 1.9) {
      if (p.z < 1.1) inmersivo.dentro = true;
      return;
    }
    fueraDelAutobus(p);
  }

  function activarInmersivo(encender) {
    if (encender === inmersivo.activo) return;
    inmersivo.activo = encender;
    if (encender) {
      inmersivo.guardado = { posicion: camara.position.clone(), mira: controles.target.clone() };
      controles.enabled = false;
      llegada.t = 1;
      inmersivo.altura = OJOS.parado;
      inmersivo.dentro = false;
      if (completo) {
        // Frente a la puerta delantera, mirando hacia ella.
        camara.position.set(5.3, OJOS.parado, 3.6);
        camara.lookAt(5.3, 1.3, 0);
      } else {
        // Se para frente a la zona del trabajo, a 2.6 m del lado de la puerta, mirándola.
        camara.position.set(objetivo.x, OJOS.parado, objetivo.z + 2.6);
        camara.lookAt(objetivo.x, Math.max(0.6, objetivo.y), objetivo.z);
      }
      camara.fov = 70;
      camara.updateProjectionMatrix();
      camara.add(herramienta);
      herramienta.position.set(0.28, -0.2, -0.6);
      herramienta.rotation.set(0.2, -0.3, 0);
      herramienta.scale.setScalar(0.32);
      manoIzquierda.visible = true;
      vista.primeraPersona = true;
      actualizarOcultos();
    } else {
      mirando = false;
      teclas.clear();
      escena.add(herramienta);
      herramienta.scale.setScalar(1);
      herramienta.rotation.set(0, 0, 0);
      manoIzquierda.visible = false;
      vista.primeraPersona = false;
      actualizarOcultos();
      camara.fov = 38;
      camara.updateProjectionMatrix();
      camara.position.copy(inmersivo.guardado.posicion);
      controles.target.copy(inmersivo.guardado.mira);
      controles.enabled = true;
      controles.update();
    }
    pedirCuadro(true);
  }

  function moverPrimeraPersona(dt) {
    if (!inmersivo.activo) return false;
    const adelante = (teclas.has('KeyW') ? 1 : 0) - (teclas.has('KeyS') ? 1 : 0);
    const lado = (teclas.has('KeyD') ? 1 : 0) - (teclas.has('KeyA') ? 1 : 0);
    const ojos = teclas.has('ShiftLeft') || teclas.has('ShiftRight') ? OJOS.agachado : OJOS.parado;
    const meta = ojos + (inmersivo.dentro ? PISO_DENTRO : 0);
    const subiendo = Math.abs(inmersivo.altura - meta) > 0.005;
    if (!adelante && !lado && !subiendo) return false;
    const velocidad = 2.4 * dt;
    // Adelante = hacia donde mira, sobre el piso; lado = perpendicular.
    const frente = new THREE.Vector3();
    camara.getWorldDirection(frente);
    frente.y = 0;
    frente.normalize();
    const derecha = new THREE.Vector3(-frente.z, 0, frente.x);
    camara.position.addScaledVector(frente, adelante * velocidad).addScaledVector(derecha, lado * velocidad);
    inmersivo.altura += (meta - inmersivo.altura) * Math.min(1, dt * 10);
    limitarPaso(camara.position);
    camara.position.y = inmersivo.altura;
    return true;
  }

  const alPresionar = (e) => {
    if (!inmersivo.activo) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      teclas.add(e.code);
      pedirCuadro();
    }
  };
  const alSoltar = (e) => teclas.delete(e.code);
  window.addEventListener('keydown', alPresionar);
  window.addEventListener('keyup', alSoltar);

  const raycaster = new THREE.Raycaster();
  const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.8);

  function rayo(x, y) {
    raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), camara);
    return raycaster;
  }

  /** Pieza bajo el punto (x, y de 0 a 1) o null. */
  // Margen para señalar: con cámara o guante la mano no es tan precisa como el mouse.
  const MARGEN = 0.035;

  // Sube desde la malla tocada hasta el nodo que es la pieza.
  function piezaDe(objeto) {
    let o = objeto;
    while (o && !o.userData.pieza) o = o.parent;
    return o;
  }

  function piezaEn(x, y) {
    // En el autobús completo la carrocería tapa lo de adentro (si no hay rayos X).
    const tapan = completo && !rayosX.activo && !inmersivo.dentro ? tapanRayo() : [];
    const golpes = rayo(x, y).intersectObjects([...mallasPieza.values(), ...tapan], true);
    const primera = golpes.find((g) => g.object.isMesh);
    const nodo = primera && piezaDe(primera.object);
    if (nodo) return { pieza: nodo.userData.pieza, punto: primera.point };
    if (completo) return null;
    // Si no cae justo encima, la pieza más cercana en pantalla dentro del margen.
    let cercana = null;
    let mejor = MARGEN;
    mallasPieza.forEach((malla) => {
      const p = malla.position.clone().project(camara);
      const separacion = Math.hypot(
        (p.x + 1) / 2 - x,
        ((1 - p.y) / 2 - y) * (camara.aspect >= 1 ? 1 / camara.aspect : 1),
      );
      if (p.z < 1 && separacion < mejor) {
        mejor = separacion;
        cercana = malla;
      }
    });
    return cercana ? { pieza: cercana.userData.pieza, punto: cercana.position.clone() } : null;
  }

  // Todas las piezas que atraviesa el rayo, de la más cercana a la más lejana (sin repetir).
  function piezasEn(x, y) {
    const tapan = completo && !rayosX.activo && !inmersivo.dentro ? tapanRayo() : [];
    const ids = [];
    const golpes = rayo(x, y)
      .intersectObjects([...mallasPieza.values(), ...tapan], true)
      .filter((g) => g.object.isMesh);
    // Se detiene en la carrocería: lo que sigue detrás no se ve.
    golpes.every((g) => {
      const nodo = piezaDe(g.object);
      if (!nodo) return false;
      if (!ids.includes(nodo.userData.pieza.id)) ids.push(nodo.userData.pieza.id);
      return true;
    });
    return ids;
  }

  function grupoEn(x, y) {
    const [primera] = rayo(x, y).intersectObjects([...recuadros.values()], false);
    return primera?.object.userData.grupo ?? null;
  }

  // La pieza resaltada late con un brillo suave (ver cuadro()).
  let resaltada = null;
  function resaltar(id) {
    if (resaltada === id) return;
    const anterior = mallasPieza.get(resaltada);
    if (anterior && anterior.userData.cambio == null) tenir(anterior, 0x000000);
    resaltada = id;
  }

  function marcarGrupo(grupo, color) {
    const sprite = recuadros.get(grupo);
    if (!sprite) return;
    const nuevo = etiqueta(String(grupo), { fondo: color, tamano: 0.55 });
    sprite.material.map = nuevo.material.map;
    sprite.material.needsUpdate = true;
  }

  function moverHerramienta(x, y, giro) {
    // En modo inmersivo la herramienta va en la mano (pegada a la cámara), no sigue al puntero.
    if (inmersivo.activo) return piezaEn(x, y);
    const encima = piezaEn(x, y);
    const punto = encima?.punto ?? rayo(x, y).ray.intersectPlane(plano, new THREE.Vector3());
    if (punto) herramienta.position.copy(punto).add(new THREE.Vector3(0, 0, 0.35));
    if (giro) {
      const g = THREE.MathUtils.degToRad;
      herramienta.rotation.set(g(giro.pitch), g(-giro.yaw), g(-giro.roll));
    }
    return encima;
  }

  // La herramienta en la mano es el modelo de la biblioteca ("h_" + id), al doble de su tamaño
  // para que se lea desde lejos; mientras carga, una forma simple.
  // La pieza de la mano va dentro de "mano" para animarla sin pelear con la posición del puntero.
  let herramientaActual = null;
  const mano = new THREE.Group();
  herramienta.add(mano);
  function elegirHerramienta(id) {
    herramientaActual = id;
    mano.clear();
    if (!id) {
      herramienta.visible = false;
      return;
    }
    const material = new THREE.MeshStandardMaterial({ color: id === 'candado' ? COLOR.mal : COLOR.tinta });
    const forma =
      {
        candado: new THREE.TorusGeometry(0.14, 0.04, 8, 16),
        multimetro: new THREE.BoxGeometry(0.22, 0.34, 0.08),
        calzas: new THREE.BoxGeometry(0.4, 0.18, 0.3),
        jabon: new THREE.CylinderGeometry(0.08, 0.08, 0.3, 12),
        escaner: new THREE.BoxGeometry(0.32, 0.2, 0.06),
        linterna: new THREE.CylinderGeometry(0.05, 0.08, 0.36, 12),
      }[id] ?? new THREE.SphereGeometry(0.14, 16, 12);
    mano.add(conAristas(new THREE.Mesh(forma, material)));
    herramienta.visible = true;
    cargarBiblioteca()
      .then((biblioteca) => {
        const original = modeloDe(biblioteca, `h_${id}`);
        if (!original || herramientaActual !== id) return null;
        const modelo = copiaDe(original);
        modelo.scale.setScalar(2);
        return compilar(modelo)
          .catch(() => {})
          .then(() => {
            if (herramientaActual !== id) return;
            mano.clear();
            mano.add(modelo);
            pedirCuadro();
          });
      })
      .catch(() => {});
  }

  // Animación de uso: la herramienta empuja hacia la pieza y regresa.
  let uso = 1;

  // Despiece: una pieza retirada viaja al piso junto al autobús y al montarla regresa a su lugar.
  // La rueda trasera mueve también la rueda del modelo del autobús (nodo rueda_7, lado de la puerta).
  const movimientos = [];
  // Lugar en el piso de cada pieza retirada: en fila junto al autobús para no encimarse.
  const enElPiso = new Map();
  // Autobús completo: el taller alrededor. Pocas mallas (las lámparas van unidas en una sola)
  // para no sumar llamadas de dibujo.
  if (completo) {
    const cuarto = new THREE.Mesh(
      new THREE.BoxGeometry(40, 8, 26),
      new THREE.MeshStandardMaterial({ color: 0x8f989f, roughness: 0.95, side: THREE.BackSide }),
    );
    cuarto.position.y = 3.99;
    escena.add(cuarto);
    // Franja de seguridad amarilla en la parte baja de las paredes.
    // Solo las 4 caras de las paredes (una caja pondría también un "piso" amarillo).
    const caras = [
      [40, 0, -12.95, 0],
      [40, 0, 12.95, Math.PI],
      [26, -19.95, 0, Math.PI / 2],
      [26, 19.95, 0, -Math.PI / 2],
    ].map(([ancho, x, z, giro]) => {
      const g = new THREE.PlaneGeometry(ancho, 0.5);
      g.rotateY(giro);
      g.translate(x, 0.6, z);
      return g;
    });
    escena.add(
      new THREE.Mesh(mergeGeometries(caras), new THREE.MeshStandardMaterial({ color: 0xe0a800, roughness: 0.7 })),
    );
    const lamparas = [];
    [-12, -4, 4, 12].forEach((x) =>
      [-4, 4].forEach((z) => {
        const g = new THREE.BoxGeometry(3, 0.08, 0.35);
        g.translate(x, 7.9, z);
        lamparas.push(g);
      }),
    );
    escena.add(
      new THREE.Mesh(
        mergeGeometries(lamparas),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 }),
      ),
    );
    // Gabinete de herramientas rojo junto al banco.
    const gabinete = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.1, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xb3121f, roughness: 0.4, metalness: 0.3 }),
    );
    gabinete.position.set(-8.9, 0.55, -2.6);
    escena.add(gabinete);
  }

  // Autobús completo: banco de trabajo detrás del autobús, del lado izquierdo; lo que se retira
  // queda en su charola (3 por fila).
  const BANCO = { x: -7.7, y: 0.92, z: -0.9 };
  if (completo) {
    const banco = new THREE.Group();
    const gris = new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.6, metalness: 0.4 });
    const tabla = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.9), gris);
    tabla.position.y = BANCO.y - 0.03;
    banco.add(tabla);
    [-0.6, 0.6].forEach((dx) =>
      [-0.4, 0.4].forEach((dz) => {
        const pata = new THREE.Mesh(new THREE.BoxGeometry(0.05, BANCO.y, 0.05), gris);
        pata.position.set(dx, BANCO.y / 2, dz);
        banco.add(pata);
      }),
    );
    const charola = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.04, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xd9480f, roughness: 0.5 }),
    );
    charola.position.y = BANCO.y + 0.02;
    banco.add(charola);
    banco.position.set(BANCO.x, 0, BANCO.z);
    escena.add(banco);
  }
  function moverPieza(piezaId, retirar) {
    const objeto = mallasPieza.get(piezaId);
    if (!objeto) return;
    objeto.userData.base ??= objeto.position.clone();
    const { base } = objeto.userData;
    const alto = objeto.userData.pieza.tamano?.[1] ?? 0.4;
    if (retirar && !enElPiso.has(piezaId)) enElPiso.set(piezaId, enElPiso.size);
    if (!retirar) enElPiso.delete(piezaId);
    const lugar = enElPiso.get(piezaId) ?? 0;
    const fuera = completo
      ? new THREE.Vector3(
          BANCO.x - 0.35 + (lugar % 3) * 0.35,
          BANCO.y + 0.16,
          BANCO.z - 0.2 + Math.floor(lugar / 3) * 0.4,
        )
      : new THREE.Vector3(
          base.x + 1.1 - lugar * 1.15,
          objeto.userData.pieza.tipo === 'rueda' ? base.y : alto / 2 + 0.02,
          base.z + 1.7,
        );
    const hasta = retirar ? fuera : base.clone();
    const delta = hasta.clone().sub(objeto.position);
    movimientos.push({ obj: objeto, desde: objeto.position.clone(), hasta, t: 0 });
    if (objeto.userData.pieza.tipo === 'rueda') {
      const ruedaBus = bus.getObjectByName('rueda_7');
      if (ruedaBus)
        movimientos.push({
          obj: ruedaBus,
          desde: ruedaBus.position.clone(),
          hasta: ruedaBus.position.clone().add(delta),
          t: 0,
        });
    }
  }

  let sacudir = 0;
  // Efectos de consecuencia: partículas simples que viven unos segundos.
  const particulas = [];
  function efecto(tipo, piezaId) {
    const origen = mallasPieza.get(piezaId)?.position.clone() ?? herramienta.position.clone();
    const ajustes = {
      chispa: { color: 0xffd8a8, n: 40, vel: 2.2, gravedad: -3, vida: 0.9 },
      burbujas: { color: 0xffffff, n: 18, vel: 0.35, gravedad: 0.6, vida: 2.4 },
      agua: { color: 0x3b6e8f, n: 26, vel: 0.6, gravedad: -4, vida: 1.2 },
      calor: { color: 0xc98a00, n: 24, vel: 0.4, gravedad: 0.9, vida: 1.8 },
    }[tipo];
    if (herramienta.visible) uso = 0;
    if (tipo === 'retirar' || tipo === 'montar') {
      moverPieza(piezaId, tipo === 'retirar');
      return;
    }
    if (tipo === 'cambio') {
      // La pieza vieja sale hacia el técnico y la nueva entra a su lugar con brillo verde.
      const malla = mallasPieza.get(piezaId);
      if (malla) malla.userData.cambio = 0;
      return;
    }
    if (tipo === 'golpe') {
      sacudir = 0.5;
      return;
    }
    if (!ajustes) return;
    for (let i = 0; i < ajustes.n; i += 1) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(tipo === 'burbujas' ? 0.05 : 0.03, 8, 6),
        new THREE.MeshBasicMaterial({ color: ajustes.color, transparent: true }),
      );
      p.position.copy(origen).add(new THREE.Vector3(0, 0, 0.2));
      p.userData = {
        v: new THREE.Vector3(
          (Math.random() - 0.5) * ajustes.vel,
          Math.random() * ajustes.vel,
          Math.random() * ajustes.vel * 0.8,
        ),
        gravedad: ajustes.gravedad,
        vida: ajustes.vida,
        edad: 0,
      };
      escena.add(p);
      particulas.push(p);
    }
  }

  // Marca una pieza ya atendida (por ejemplo, el candado puesto).
  // Vuela la cámara hacia una pieza (o a la vista general si no hay id) y la deja de frente.
  // También acepta una zona: { objetivo: [x, y, z], distancia, vista?: [x, y, z] (de dónde se mira) }.
  function enfocar(id, cerca = 4.2) {
    const zona = id && typeof id === 'object' ? id : null;
    const malla = zona ? null : mallasPieza.get(id);
    let mira = objetivo.clone();
    if (zona) mira = new THREE.Vector3(...zona.objetivo);
    else if (malla) mira = malla.getWorldPosition(new THREE.Vector3());
    let lejos = malla ? cerca : distancia * 1.6;
    if (zona) lejos = zona.distancia;
    const desdeDonde = zona?.vista ? new THREE.Vector3(...zona.vista).normalize() : direccion;
    Object.assign(llegada, {
      t: 0,
      duracion: menosMovimiento ? 0.01 : 0.9,
      desde: camara.position.clone(),
      hasta: mira.clone().addScaledVector(desdeDonde, lejos),
      miraDesde: controles.target.clone(),
      miraHasta: mira,
    });
  }

  function marcarPieza(id, tipo = 'ok') {
    const malla = mallasPieza.get(id);
    if (!malla) return;
    const [texto, fondo] = {
      ok: ['✓', '#2f7d43'],
      candado: ['L', '#b3121f'],
      mal: ['!', '#b3121f'],
      atencion: ['!', '#c98a00'],
    }[tipo] ?? ['✓', '#2f7d43'];
    // En el autobús completo las piezas son chicas: la marca también.
    const marca = etiqueta(texto, { fondo, tamano: completo ? 0.2 : 0.32 });
    marca.position.set(0, (malla.geometry?.parameters.height ?? 0.4) / 2 + 0.25, 0);
    marca.userData.marca = true;
    malla.add(marca);
  }

  // Regresa a su lugar todo lo que se retiró (para empezar una orden de nuevo).
  function reiniciarPiezas() {
    movimientos.length = 0;
    enElPiso.clear();
    mallasPieza.forEach((malla) => {
      if (malla.userData.base) malla.position.copy(malla.userData.base);
    });
  }

  // Sin id quita todas las marcas; con id, solo las de esa pieza.
  function quitarMarcas(id = null) {
    mallasPieza.forEach((malla, clave) => {
      if (id && clave !== id) return;
      malla.remove(...malla.children.filter((h) => h.userData.marca));
    });
  }

  // Botón de calidad en la esquina del lienzo.
  if (getComputedStyle(contenedor).position === 'static') contenedor.classList.add('relative');
  const botonCalidad = document.createElement('button');
  botonCalidad.type = 'button';
  botonCalidad.className =
    'absolute bottom-2 right-2 z-10 border border-placa-linea bg-white/90 px-2 py-1 text-xs font-semibold text-tinta hover:border-tinta';
  const rotularCalidad = () => {
    botonCalidad.textContent = calidad === 'normal' ? 'Calidad: normal' : 'Calidad: ligera';
    botonCalidad.title = 'Cambia entre calidad normal y ligera (sin sombras, para computadoras lentas)';
  };
  botonCalidad.addEventListener('click', () => {
    calidad = calidad === 'normal' ? 'ligero' : 'normal';
    localStorage.setItem('calidad3d', calidad);
    localStorage.setItem('calidad3dElegida', '1');
    rotularCalidad();
    aplicarCalidad();
  });
  rotularCalidad();
  contenedor.append(botonCalidad);
  aplicarCalidad();

  // Medición de la entrada de cámara: si va a menos de ~30 cuadros por segundo, pasa a ligero
  // (solo si la persona no eligió la calidad a mano).
  const medicion = { cuadros: 0, tiempo: 0, lista: localStorage.getItem('calidad3dElegida') === '1' };

  const reloj = new THREE.Clock();
  let activo = true;
  let dibujoSeguido = false;
  let ultimoDibujo = 0;
  function cuadro() {
    if (!activo) return;
    requestAnimationFrame(cuadro);
    const dt = Math.min(reloj.getDelta(), 0.05);
    const animando =
      particulas.length > 0 ||
      sacudir > 0 ||
      llegada.t < 1 ||
      uso < 1 ||
      movimientos.length > 0 ||
      tapa.t < 1 ||
      [...mallasPieza.values()].some((m) => m.userData.cambio != null);
    // Caminar en primera persona o el amortiguado de la cámara también piden cuadros.
    const camaraMovida = moverPrimeraPersona(dt) || (!inmersivo.activo && controles.update());
    if (!animando && !camaraMovida && !pendiente) {
      dibujoSeguido = false;
      return;
    }
    // Solo cuenta para la resolución dinámica si el cuadro anterior también se dibujó.
    if (dibujoSeguido) vigilarCuadro(reloj.elapsedTime - ultimoDibujo);
    dibujoSeguido = true;
    ultimoDibujo = reloj.elapsedTime;
    pendiente = false;
    if (!medicion.lista && llegada.t < 1) {
      medicion.cuadros += 1;
      medicion.tiempo += dt;
      if (medicion.cuadros >= 40) {
        medicion.lista = true;
        if (calidad === 'normal' && medicion.tiempo / medicion.cuadros > 1 / 30) {
          calidad = 'ligero';
          localStorage.setItem('calidad3d', calidad);
          rotularCalidad();
          aplicarCalidad();
        }
      }
    }
    for (let i = particulas.length - 1; i >= 0; i -= 1) {
      const p = particulas[i];
      p.userData.edad += dt;
      p.userData.v.y += p.userData.gravedad * dt;
      p.position.addScaledVector(p.userData.v, dt);
      p.material.opacity = 1 - p.userData.edad / p.userData.vida;
      if (p.userData.edad >= p.userData.vida) {
        escena.remove(p);
        particulas.splice(i, 1);
      }
    }
    if (sacudir > 0) {
      sacudir -= dt;
      bus.position.set(sacudir > 0 ? (Math.random() - 0.5) * 0.12 * sacudir : 0, 0, 0);
    }
    mallasPieza.forEach((malla, id) => {
      const m = malla;
      const { modelo } = m.userData;
      if (m.userData.cambio == null) {
        // Pieza resaltada: brillo fijo (latir obligaría a redibujar todo el tiempo).
        if (id === resaltada) tenir(m, 0xff7a00, 0.55);
        return;
      }
      m.userData.cambio += dt;
      if (!modelo) {
        // Sin modelo: la caja se encoge, cambia a verde y regresa.
        const t = Math.min(1, m.userData.cambio / 1.2);
        const escala = t < 0.5 ? 1 - t * 1.6 : 0.2 + (t - 0.5) * 1.6;
        m.scale.setScalar(Math.max(0.05, escala));
        if (t >= 0.5) m.material.color.setHex(COLOR.ok);
        if (t >= 1) {
          m.scale.setScalar(1);
          m.userData.cambio = null;
        }
        return;
      }
      // Con modelo: 0–40 % sale hacia afuera y se inclina; 40–55 % fuera de vista;
      // 55–100 % entra la nueva desde afuera con brillo verde que se apaga.
      const t = Math.min(1, m.userData.cambio / 2.2);
      const suave = (x) => x * x * (3 - 2 * x);
      if (t < 0.4) {
        const k = suave(t / 0.4);
        modelo.position.set(0, k * 0.25, k * 0.9);
        modelo.rotation.set(k * 0.5, k * 0.3, 0);
        modelo.scale.setScalar(1 - k * 0.3);
      } else if (t < 0.55) {
        modelo.visible = false;
      } else {
        const k = suave((t - 0.55) / 0.45);
        modelo.visible = true;
        modelo.position.set(0, (1 - k) * 0.25, (1 - k) * 0.9);
        modelo.rotation.set(0, 0, 0);
        modelo.scale.setScalar(0.7 + k * 0.3);
        tenir(m, COLOR.ok, 1.2 * (1 - k) + 0.15);
      }
      if (t >= 1) {
        modelo.position.set(0, 0, 0);
        modelo.scale.setScalar(1);
        tenir(m, 0x000000);
        m.userData.cambio = null;
        renderer.shadowMap.needsUpdate = true;
      }
    });
    for (let i = movimientos.length - 1; i >= 0; i -= 1) {
      const mov = movimientos[i];
      mov.t = Math.min(1, mov.t + dt / (menosMovimiento ? 0.01 : 1.1));
      const k = mov.t * mov.t * (3 - 2 * mov.t);
      mov.obj.position.lerpVectors(mov.desde, mov.hasta, k);
      // Se levanta un poco en el camino para que se vea que la pieza sale.
      mov.obj.position.y += Math.sin(k * Math.PI) * 0.25;
      if (mov.t >= 1) {
        movimientos.splice(i, 1);
        renderer.shadowMap.needsUpdate = true;
      }
    }
    // Herramienta: al usarla empuja hacia la pieza y regresa.
    if (uso < 1) {
      uso = Math.min(1, uso + dt / 0.45);
      mano.position.set(0, 0, -Math.sin(uso * Math.PI) * 0.3);
      // La llave gira de ida y vuelta, como matraca.
      mano.rotation.z = herramientaActual === 'llave' ? Math.sin(uso * Math.PI * 3) * 0.9 : 0;
    }
    if (tapa.t < 1 && tapaMotor) {
      tapa.t = Math.min(1, tapa.t + dt / (menosMovimiento ? 0.01 : 0.8));
      const k = tapa.t * tapa.t * (3 - 2 * tapa.t);
      tapaMotor.rotation.z = THREE.MathUtils.lerp(tapa.desde, tapa.hasta, k);
    }
    // Entrada de la cámara.
    if (llegada.t < 1) {
      llegada.t = Math.min(1, llegada.t + dt / llegada.duracion);
      const k = 1 - (1 - llegada.t) ** 3;
      camara.position.lerpVectors(llegada.desde, llegada.hasta, k);
      controles.target.lerpVectors(llegada.miraDesde, llegada.miraHasta, k);
      controles.update();
    }
    renderer.render(escena, camara);
  }

  // Paneles que tapan los lados del lienzo (px): el centro de la vista se corre al espacio libre.
  const margen = { izquierda: 0, derecha: 0 };
  function ajustarTamano() {
    const { clientWidth: ancho, clientHeight: alto } = contenedor;
    if (!ancho || !alto) return;
    renderer.setSize(ancho, alto, false);
    ajustarResolucion();
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camara.aspect = ancho / alto;
    const corrimiento = (margen.derecha - margen.izquierda) / 2;
    if (corrimiento && !inmersivo.activo) camara.setViewOffset(ancho, alto, corrimiento, 0, ancho, alto);
    else camara.clearViewOffset();
    camara.updateProjectionMatrix();
    pedirCuadro();
  }
  new ResizeObserver(ajustarTamano).observe(contenedor);
  ajustarTamano();
  cuadro();

  // Todo lo que las páginas cambian en la escena pide un cuadro nuevo.
  const yRedibujar =
    (fn, sombras = false) =>
    (...args) => {
      const r = fn(...args);
      pedirCuadro(sombras);
      return r;
    };

  return {
    lienzo: renderer.domElement,
    piezaEn,
    piezasEn,
    grupoEn,
    // Solo redibuja si cambia la pieza resaltada (se llama en cada movimiento del mouse).
    resaltar: (id) => {
      if (id !== resaltada) {
        resaltar(id);
        pedirCuadro();
      }
    },
    marcarGrupo: yRedibujar(marcarGrupo),
    marcarPieza: yRedibujar(marcarPieza),
    quitarMarcas: yRedibujar(quitarMarcas),
    reiniciarPiezas: yRedibujar(reiniciarPiezas, true),
    enfocar: yRedibujar(enfocar),
    activarInmersivo: yRedibujar(activarInmersivo),
    // En primera persona la herramienta va pegada a la cámara: mover el cursor no cambia la imagen.
    moverHerramienta: (...args) => {
      const r = moverHerramienta(...args);
      if (!inmersivo.activo) pedirCuadro();
      return r;
    },
    elegirHerramienta: yRedibujar(elegirHerramienta),
    verRayosX: yRedibujar(verRayosX),
    abrirTapa: yRedibujar(abrirTapa),
    rayosXActivo: () => rayosX.activo,
    idsPiezas: () => [...mallasPieza.keys()],
    // Dónde se ve la pieza en el lienzo (x, y de 0 a 1).
    fijarMargenes(izquierda, derecha) {
      Object.assign(margen, { izquierda, derecha });
      ajustarTamano();
    },
    pantallaDe: (id) => {
      const p = mallasPieza.get(id)?.getWorldPosition(new THREE.Vector3()).project(camara);
      return p ? [(p.x + 1) / 2, (1 - p.y) / 2] : null;
    },
    posicionDe: (id) => mallasPieza.get(id)?.getWorldPosition(new THREE.Vector3()).toArray() ?? null,
    efecto: yRedibujar(efecto, true),
    nombrePieza: (id) => mallasPieza.get(id)?.userData.pieza.nombre ?? id,
    destruir() {
      activo = false;
      window.removeEventListener('keydown', alPresionar);
      window.removeEventListener('keyup', alSoltar);
      renderer.dispose();
    },
  };
}
