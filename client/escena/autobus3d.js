// Escena 3D del autobús con Three.js, dibujada como la lámina del manual: carrocería gris claro con
// aristas en tinta, recuadros numerados por grupo de función y naranja solo para alto voltaje.
// La usan la exploración por grupos y los escenarios de práctica.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

function construirAutobus(tipo) {
  const bus = new THREE.Group();
  // Carrocería.
  bus.add(caja([12, 2.8, 2.5], COLOR.carroceria, [0, 1.85, 0]));
  // Banda de ventanas a los dos lados y parabrisas.
  [1.26, -1.26].forEach((z) => {
    for (let x = -4.6; x <= 3.4; x += 1.6) {
      bus.add(caja([1.4, 0.95, 0.02], COLOR.vidrio, [x, 2.45, z]));
    }
  });
  bus.add(caja([0.02, 1.4, 2.2], COLOR.vidrio, [6.01, 2.3, 0]));
  // Puertas del lado derecho.
  bus.add(caja([1.1, 2.4, 0.03], 0xe3e8ec, [5.0, 1.65, 1.27]));
  bus.add(caja([1.2, 2.4, 0.03], 0xe3e8ec, [0.6, 1.65, 1.27]));
  // Defensa y faldón.
  bus.add(caja([12.1, 0.18, 2.55], COLOR.llanta, [0, 0.5, 0]));
  // Ruedas.
  [-3.8, 4.1].forEach((x) => [1.1, -1.1].forEach((z) => bus.add(rueda(x, z))));

  if (tipo === 'electrico') {
    // Paquete de baterías de 600 V en el techo, con su marca naranja.
    const baterias = caja([5.2, 0.3, 1.9], COLOR.hvSuave, [0, 3.4, 0]);
    baterias.children[0].material.color.set(COLOR.hv);
    bus.add(baterias);
    const marca = etiqueta('600 V', { fondo: '#d9480f', tamano: 0.6 });
    marca.position.set(2.4, 3.85, -0.7);
    bus.add(marca);
  } else {
    // Compartimiento del motor atrás y escape.
    bus.add(caja([0.03, 1.1, 2.0], 0xe3e8ec, [-6.01, 1.25, 0]));
    const escape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.0, 12),
      new THREE.MeshStandardMaterial({ color: COLOR.metal }),
    );
    escape.position.set(-5.7, 3.6, -0.9);
    bus.add(conAristas(escape));
  }
  return bus;
}

/**
 * Crea la escena en un contenedor.
 * @param {HTMLElement} contenedor
 * @param {{ autobus: 'electrico'|'diesel', piezas?: any[], enfoque?: {objetivo, distancia}, grupos?: boolean }} opciones
 */
export function crearEscena(contenedor, { autobus, piezas = [], enfoque, grupos = false }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  contenedor.append(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(COLOR.papel);
  escena.add(new THREE.HemisphereLight(0xffffff, 0xc9d1d8, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.4);
  sol.position.set(6, 12, 8);
  escena.add(sol);
  const rejilla = new THREE.GridHelper(30, 30, COLOR.linea, COLOR.linea);
  escena.add(rejilla);

  const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const objetivo = new THREE.Vector3(...(enfoque?.objetivo ?? [0, 1.6, 0]));
  const distancia = enfoque?.distancia ?? 9;
  // La cámara mira desde el lado derecho, un poco arriba y adelante; distancia es la del JSON.
  camara.position
    .copy(objetivo)
    .add(new THREE.Vector3(0.35, 0.5, 1).normalize().multiplyScalar(distancia * 1.6));
  const controles = new OrbitControls(camara, renderer.domElement);
  controles.target.copy(objetivo);
  // Clic izquierdo = usar la herramienta o elegir; derecho gira la vista; la rueda acerca.
  controles.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controles.enablePan = false;
  controles.minDistance = 3;
  controles.maxDistance = 25;
  controles.maxPolarAngle = Math.PI * 0.49;
  controles.update();

  const bus = construirAutobus(autobus);
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
    if (pieza.tipo === 'rueda') malla.rotation.x = Math.PI / 2;
    malla.position.set(...pieza.pos);
    malla.userData.pieza = pieza;
    conAristas(malla, pieza.tipo === 'rueda' ? COLOR.tinta : COLOR.tinta);
    escena.add(malla);
    mallasPieza.set(pieza.id, malla);
  });

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

  let resaltada = null;
  function resaltar(id) {
    if (resaltada === id) return;
    if (resaltada) mallasPieza.get(resaltada)?.material.emissive?.setHex(0x000000);
    resaltada = id;
    if (id) mallasPieza.get(id)?.material.emissive?.setHex(0x333333);
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

  function elegirHerramienta(id) {
    herramienta.clear();
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
    herramienta.add(conAristas(new THREE.Mesh(forma, material)));
    herramienta.visible = true;
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

  const reloj = new THREE.Clock();
  let activo = true;
  function cuadro() {
    if (!activo) return;
    const dt = Math.min(reloj.getDelta(), 0.05);
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
      bus.position.set((Math.random() - 0.5) * 0.12 * sacudir, 0, 0);
    } else {
      bus.position.set(0, 0, 0);
    }
    controles.update();
    renderer.render(escena, camara);
    requestAnimationFrame(cuadro);
  }

  function ajustarTamano() {
    const { clientWidth: ancho, clientHeight: alto } = contenedor;
    if (!ancho || !alto) return;
    renderer.setSize(ancho, alto, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
  }
  new ResizeObserver(ajustarTamano).observe(contenedor);
  ajustarTamano();
  cuadro();

  return {
    lienzo: renderer.domElement,
    piezaEn,
    grupoEn,
    resaltar,
    marcarGrupo,
    marcarPieza,
    moverHerramienta,
    elegirHerramienta,
    efecto,
    nombrePieza: (id) => mallasPieza.get(id)?.userData.pieza.nombre ?? id,
    destruir() {
      activo = false;
      renderer.dispose();
    },
  };
}
