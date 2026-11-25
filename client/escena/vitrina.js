// Vitrina: el Volvo Access girando despacio, como en una sala de exhibición.
// Es un visor aparte y ligero (sin controles ni piezas) para la entrada y Mi camino.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const RUTA = '/modelos/autobus_diesel.glb';

/**
 * Monta la vitrina en un contenedor. Devuelve una función para apagarla.
 * @param {HTMLElement} caja contenedor (se llena con el lienzo)
 * @param {{ fondo?: number, velocidad?: number }} [op]
 */
export function montarVitrina(caja, op = {}) {
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'block h-full w-full';
  caja.append(renderer.domElement);

  const escena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camara = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(6, 12, 8);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  escena.add(sol, new THREE.HemisphereLight(0xffffff, 0x2a333c, 0.5));

  // Piso que solo recibe la sombra: el autobús "se asienta" sobre el fondo de la página.
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.35 }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  escena.add(piso);

  const giro = new THREE.Group();
  escena.add(giro);
  let largo = 12;
  let activo = true;
  let entrada = 0; // 0 → 1: el autobús aparece subiendo y enfocándose

  new GLTFLoader().loadAsync(RUTA).then(({ scene: modelo }) => {
    if (!activo) return;
    // La sombra horneada en Blender (blanco = sombra) se vuelve un plano negro transparente y no cuenta
    // para el tamaño; el resto proyecta sombra.
    const b = new THREE.Box3();
    modelo.children.forEach((parte) => {
      if (parte.name === 'sombra_piso') {
        Object.assign(parte, {
          material: new THREE.MeshBasicMaterial({
            color: 0x000000,
            alphaMap: parte.material.map,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
          }),
        });
        parte.position.setY(parte.position.y + 0.006);
        return;
      }
      b.expandByObject(parte);
      parte.traverse((o) => {
        if (o.isMesh) Object.assign(o, { castShadow: true, receiveShadow: true });
      });
    });
    const t = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    modelo.position.set(-c.x, -b.min.y, -c.z);
    largo = Math.max(t.x, t.z);
    giro.add(modelo);
    sol.shadow.camera.left = -largo;
    sol.shadow.camera.right = largo;
    sol.shadow.camera.top = largo;
    sol.shadow.camera.bottom = -largo;
    sol.shadow.camera.updateProjectionMatrix();
    caja.setAttribute('data-listo', '1');
  });

  function medir() {
    const { clientWidth: w, clientHeight: h } = caja;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(medir);
  ro.observe(caja);
  medir();

  const reloj = new THREE.Clock();
  giro.rotation.y = -0.6;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(reloj.getDelta(), 0.05);
    if (giro.children.length) entrada = Math.min(1, entrada + dt * 0.8);
    const e = 1 - (1 - entrada) ** 3;
    if (!quieto) giro.rotation.y += dt * (op.velocidad ?? 0.18);
    // Encuadre: todo el autobús cabe en cualquier tamaño del contenedor.
    // Distancia para que quepa una esfera del largo del autobús en el lado más angosto de la vista.
    const vfov = THREE.MathUtils.degToRad(camara.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camara.aspect);
    const d = ((largo * 0.5) / Math.sin(Math.min(vfov, hfov) / 2)) * (1.0 - 0.1 * e);
    camara.position.set(d * 0.74, d * 0.3, d * 0.6);
    camara.lookAt(0, 1.3, 0);
    giro.position.y = (1 - e) * -0.6;
    renderer.render(escena, camara);
  });

  return () => {
    activo = false;
    renderer.setAnimationLoop(null);
    ro.disconnect();
    renderer.dispose();
    pmrem.dispose();
  };
}
