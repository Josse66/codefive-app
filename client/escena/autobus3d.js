// Escena 3D del autobús con Three.js, dibujada como la lámina del manual: carrocería gris claro con
// aristas en tinta, recuadros numerados por grupo de función y naranja solo para alto voltaje.
// La usan la exploración por grupos y los escenarios de práctica.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

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
// Se descarga una sola vez y cada escena usa una copia.
const RUTA_MODELO = '/modelos/autobus_urbano.glb';
const TECHO = 3.25;
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

// Copia de un modelo con materiales propios (para poder resaltarla sin tocar las demás) y sombras.
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

// Paquete de baterías o escape, encima del techo cuya altura se recibe.
// Con la biblioteca cargada usa los modelos; si no, cajas.
function agregarExtras(bus, tipo, techo, biblioteca) {
  const extras = new THREE.Group();
  const modelo = biblioteca?.getObjectByName(tipo === 'electrico' ? 'baterias_techo' : 'escape');
  if (tipo === 'electrico') {
    // Paquete de baterías de 600 V en el techo, con su marca naranja.
    if (modelo) {
      const baterias = copiaDe(modelo);
      baterias.position.set(0, techo, 0);
      extras.add(baterias);
    } else {
      const baterias = caja([5.2, 0.3, 1.9], COLOR.hvSuave, [0, techo + 0.15, 0]);
      baterias.children[0].material.color.set(COLOR.hv);
      extras.add(baterias);
    }
    const marca = etiqueta('600 V', { fondo: '#d9480f', tamano: 0.6 });
    marca.position.set(2.4, techo + 0.6, -0.7);
    extras.add(marca);
  } else if (modelo) {
    const escape = copiaDe(modelo);
    escape.position.set(-5.7, techo + 0.2, -0.9);
    extras.add(escape);
  } else {
    const escape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.0, 12),
      new THREE.MeshStandardMaterial({ color: COLOR.metal }),
    );
    escape.position.set(-5.7, techo + 0.2, -0.9);
    extras.add(conAristas(escape));
  }
  bus.add(extras);
  return extras;
}

function construirAutobus(tipo, alCargar = () => {}) {
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

  let extras = agregarExtras(bus, tipo, TECHO);

  // Cuando llega el modelo realista, sustituye a los bloques y los extras se acomodan a su techo.
  Promise.all([cargarModelo(), cargarBiblioteca().catch(() => null)])
    .then(([modelo, biblioteca]) => {
      const copia = copiaDe(modelo);
      // Las piezas de los escenarios están medidas sobre el techo de 3.25 m de los bloques.
      // La carrocería se estira a lo alto; las ruedas crecen parejo para seguir redondas y en el piso.
      const factor = TECHO / new THREE.Box3().setFromObject(copia).max.y;
      copia.children.forEach((parte) => {
        const p = parte;
        if (p.name.startsWith('rueda')) {
          p.scale.multiplyScalar(factor);
          p.position.y *= factor;
        } else {
          p.scale.y *= factor;
        }
      });
      bus.remove(bloques, extras);
      bus.add(copia);
      extras = agregarExtras(bus, tipo, TECHO, biblioteca);
      alCargar();
    })
    .catch(() => {});
  return bus;
}

/**
 * Crea la escena en un contenedor.
 * @param {HTMLElement} contenedor
 * @param {{ autobus: 'electrico'|'diesel', piezas?: any[], enfoque?: {objetivo, distancia}, grupos?: boolean }} opciones
 */
export function crearEscena(contenedor, { autobus, piezas = [], enfoque, grupos = false }) {
  // Calidad: "normal" (sombras, resolución hasta 1.5) o "ligero" (sin sombras, resolución 1).
  // Se guarda en el navegador; si la computadora va lenta se cambia sola a ligero.
  let calidad = localStorage.getItem('calidad3d') ?? 'normal';
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  // Aplica la calidad: resolución y sombras.
  function aplicarCalidad() {
    const normal = calidad === 'normal';
    renderer.setPixelRatio(normal ? Math.min(window.devicePixelRatio, 1.5) : 1);
    renderer.shadowMap.enabled = normal;
    escena.traverse((n) => {
      if (n.material) Object.assign(n.material, { needsUpdate: true });
    });
    pedirCuadro(true);
  }

  const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const objetivo = new THREE.Vector3(...(enfoque?.objetivo ?? [0, 1.6, 0]));
  const distancia = enfoque?.distancia ?? 9;
  // La cámara mira desde el lado derecho, un poco arriba y adelante; distancia es la del JSON.
  const direccion = new THREE.Vector3(0.35, 0.5, 1).normalize();
  camara.position.copy(objetivo).addScaledVector(direccion, distancia * 1.6);
  // Entrada: la cámara llega desde lejos y de lado hasta su lugar.
  const llegada = {
    t: 0,
    desde: objetivo.clone().addScaledVector(new THREE.Vector3(1.1, 0.7, 0.9).normalize(), distancia * 3.2),
    hasta: camara.position.clone(),
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
  controles.maxDistance = 34;
  controles.maxPolarAngle = Math.PI * 0.49;
  controles.update();

  const bus = construirAutobus(autobus, () => pedirCuadro(true));
  escena.add(bus);

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
        const original = biblioteca.getObjectByName(id);
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

  const raycaster = new THREE.Raycaster();
  const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.8);

  function rayo(x, y) {
    raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), camara);
    return raycaster;
  }

  /** Pieza bajo el punto (x, y de 0 a 1) o null. */
  // Margen para señalar: con cámara o guante la mano no es tan precisa como el mouse.
  const MARGEN = 0.035;

  function piezaEn(x, y) {
    const [primera] = rayo(x, y).intersectObjects([...mallasPieza.values()], false);
    if (primera) return { pieza: primera.object.userData.pieza, punto: primera.point };
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
        const original = biblioteca.getObjectByName(`h_${id}`);
        if (!original || herramientaActual !== id) return;
        const modelo = copiaDe(original);
        modelo.scale.setScalar(2);
        mano.clear();
        mano.add(modelo);
        pedirCuadro();
      })
      .catch(() => {});
  }

  // Animación de uso: la herramienta empuja hacia la pieza y regresa.
  let uso = 1;

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
  function marcarPieza(id, tipo = 'ok') {
    const malla = mallasPieza.get(id);
    if (!malla) return;
    const marca = etiqueta(tipo === 'candado' ? 'L' : '✓', {
      fondo: tipo === 'candado' ? '#b3121f' : '#2f7d43',
      tamano: 0.32,
    });
    marca.position.set(0, (malla.geometry.parameters.height ?? 0.4) / 2 + 0.25, 0);
    malla.add(marca);
  }

  // Botón de calidad en la esquina del lienzo.
  if (getComputedStyle(contenedor).position === 'static') contenedor.classList.add('relative');
  const botonCalidad = document.createElement('button');
  botonCalidad.type = 'button';
  botonCalidad.className =
    'absolute right-2 top-2 z-10 border border-placa-linea bg-white/90 px-2 py-1 text-xs font-semibold text-tinta hover:border-tinta';
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
  function cuadro() {
    if (!activo) return;
    requestAnimationFrame(cuadro);
    const dt = Math.min(reloj.getDelta(), 0.05);
    const animando =
      particulas.length > 0 ||
      sacudir > 0 ||
      llegada.t < 1 ||
      uso < 1 ||
      [...mallasPieza.values()].some((m) => m.userData.cambio != null);
    // El amortiguado de la cámara también pide cuadros mientras se mueve.
    const camaraMovida = controles.update();
    if (!animando && !camaraMovida && !pendiente) return;
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
        if (id === resaltada) tenir(m, 0x3a3020, 0.9);
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
    // Herramienta: al usarla empuja hacia la pieza y regresa.
    if (uso < 1) {
      uso = Math.min(1, uso + dt / 0.45);
      mano.position.set(0, 0, -Math.sin(uso * Math.PI) * 0.3);
    }
    // Entrada de la cámara.
    if (llegada.t < 1) {
      llegada.t = Math.min(1, llegada.t + dt / 1.8);
      const k = 1 - (1 - llegada.t) ** 3;
      camara.position.lerpVectors(llegada.desde, llegada.hasta, k);
      controles.update();
    }
    renderer.render(escena, camara);
  }

  function ajustarTamano() {
    const { clientWidth: ancho, clientHeight: alto } = contenedor;
    if (!ancho || !alto) return;
    renderer.setSize(ancho, alto, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camara.aspect = ancho / alto;
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
    grupoEn,
    resaltar: yRedibujar(resaltar),
    marcarGrupo: yRedibujar(marcarGrupo),
    marcarPieza: yRedibujar(marcarPieza),
    moverHerramienta: yRedibujar(moverHerramienta),
    elegirHerramienta: yRedibujar(elegirHerramienta),
    efecto: yRedibujar(efecto, true),
    nombrePieza: (id) => mallasPieza.get(id)?.userData.pieza.nombre ?? id,
    destruir() {
      activo = false;
      renderer.dispose();
    },
  };
}
