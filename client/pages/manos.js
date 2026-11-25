/* eslint-disable no-use-before-define -- el ciclo de la cámara llama a funciones de dibujo y de cada tipo de ejercicio, declaradas más abajo (son funciones elevadas). */
// Entrena tus manos: la cámara ve las manos (MediaPipe, sin internet) y encima se dibuja la
// herramienta. Cada ejercicio viene de data/manos/ejercicios.json; aquí vive la lógica de cada
// tipo: "giro" (torquímetro: tomar en la marca, jalar parejo, parar en el clic) y "punta"
// (multímetro: una sola mano, punta como lápiz, borne correcto). Se corrige una cosa a la vez y
// cada intento va a la bitácora del técnico (Pareto, ICO, alerta crítica en el panel).
import DATOS from '../../data/manos/ejercicios.json';
import {
  Histeresis,
  anguloAlrededor,
  calificar,
  dentro,
  desviacionMuneca,
  distancia,
  enUnidades,
  palma,
  sobreMango,
} from '../manos/reglas.js';
import {
  AJUSTES,
  agarre,
  calibrada,
  camaras,
  camPosicion,
  detectar,
  dibujarPrincipal,
  dibujarRecuadro,
  encenderCamaras,
  guardarAjustes,
  manosEnPantalla,
  modoGuante,
  motivo,
  pinzas,
  sinImagen,
  volteo,
} from '../manos/camaras.js';
import { Calibracion } from '../manos/calibracion.js';
import { FaseGuante } from '../manos/faseGuante.js';
import {
  activo as guanteActivo,
  alCambiar as alCambiarGuante,
  alternarConexion,
  simular as simularGuante,
  calibrarMuneca,
  desviacion as desviacionGuante,
  guante,
  led,
  pitar,
  pitarDoble,
} from '../manos/guante.js';
import { hablar } from '../accesibilidad/voz.js';
import { sonar } from '../escena/sonidos.js';

const $ = (id) => document.getElementById(id);
const raiz = $('manos');
const { tecnicoId, ejercicio: idEjercicio, experiencia } = raiz.dataset;
const EJ = DATOS.ejercicios.find((e) => e.id === idEjercicio);
const P = EJ.parametros;
const PASO_A_PASO = experiencia === 'mayor';
const APROBACION = 91;
const API = `/api/tecnicos/${tecnicoId}/simulador`;

const lienzo = $('lienzo-manos');
const ctx = lienzo.getContext('2d');
const ASPECTO = lienzo.width / lienzo.height;
const aPx = (p) => ({ x: p.x * lienzo.width, y: p.y * lienzo.height });
const U = (p) => enUnidades(p, ASPECTO);

const COLOR = { tinta: '#141c24', marca: '#e0a800', ok: '#2f7d43', mal: '#b42318', blanco: '#ffffff' };

// ---------- Estado del intento ----------
const estado = {
  fase: 'camara',
  fallas: new Set(),
  ultimaFalla: null,
  frase: '',
  // giro
  angulo: 0,
  inicio: null,
  historial: [],
  tClic: 0,
  pasado: 0,
  agarrado: false,
  enZonaDesde: 0,
  abiertaDesde: 0,
  munecaDesde: 0,
  zonaMalDesde: 0,
  // punta
  sosteniendo: 0,
  sinLapizDesde: 0,
  lectura: null,
  // secuencia
  base: null,
  apretadas: [],
  apretando: null,
  desde: 0,
  pista: 0,
};

// Dos partes por práctica: 1) cámaras con la mano libre (dónde y en qué orden); 2) guante (con qué
// fuerza y postura). Cada una se califica aparte; la final es el promedio de las que se hicieron.
let modo = 'camaras'; // 'camaras' | 'guante'
const partes = { camaras: null, guante: null }; // { nota, fallas: [ids] }
let faseGuante = null;

function reiniciar() {
  modo = 'camaras';
  partes.camaras = null;
  partes.guante = null;
  $('pasos-guante').hidden = true;
  Object.assign(estado, {
    fase: 'acerca',
    fallas: new Set(),
    ultimaFalla: null,
    angulo: 0,
    inicio: null,
    historial: [],
    tClic: 0,
    pasado: 0,
    agarrado: false,
    enZonaDesde: 0,
    abiertaDesde: 0,
    munecaDesde: 0,
    zonaMalDesde: 0,
    sosteniendo: 0,
    sinLapizDesde: 0,
    lectura: null,
    base: null,
    apretadas: [],
    apretando: null,
    desde: 0,
    pista: 0,
  });
  $('resultado-manos').hidden = true;
  $('otra-vez').hidden = true;
}

// Una falla cuenta una vez por intento; la frase se muestra (y en Paso a paso se lee) unos segundos.
function fallar(id) {
  const regla = EJ.reglas.find((r) => r.id === id);
  if (!regla) return;
  estado.ultimaFalla = { regla, hasta: performance.now() + 2600 };
  if (!estado.fallas.has(id)) {
    estado.fallas.add(id);
    sonar(regla.critico ? 'critico' : 'mal');
    pitarDoble();
  }
}

let ultimoDicho = '';
let dichoEn = 0;
function decir(texto, tono = 'guia') {
  estado.frase = texto;
  const caja = $('estado-manos');
  caja.textContent = texto;
  caja.style.background = {
    guia: 'rgba(20,28,36,.85)',
    mal: 'rgba(180,35,24,.92)',
    ok: 'rgba(47,125,67,.92)',
  }[tono];
  if (PASO_A_PASO && texto && texto !== ultimoDicho && performance.now() - dichoEn > 2200) {
    ultimoDicho = texto;
    dichoEn = performance.now();
    hablar(texto);
  }
}

// Lo que se ve abajo: la falla reciente manda; si no, la guía del momento.
function frase(guia, tono = 'guia') {
  const f = estado.ultimaFalla;
  if (f && performance.now() < f.hasta) decir(f.regla.frase, 'mal');
  else decir(guia, tono);
}

// ---------- Guante (manos/guante.js): estado y lecturas en vivo ----------
function pintarGuante() {
  const ok = guante.conectado;
  modoGuante(ok);
  $('guante').textContent = ok && !guante.simulado ? 'Desconectar guante' : 'Conectar guante';
  $('guante').hidden = Boolean(guante.simulado);
  $('guante-demo').textContent = guante.simulado ? 'Salir de la demostración' : 'Modo demostración';
  $('muneca-recta').hidden = !ok;
  $('lectura-guante').hidden = !ok;
  let texto = 'Sin guante: todo se revisa con la cámara.';
  if (guante.simulado)
    texto =
      'Demostración: mueve el mouse a los lados para girar la muñeca; arriba y abajo la doblas. Barra espaciadora = apretar el mango.';
  else if (ok && guante.neutro)
    texto = 'Guante conectado y calibrado: mide la muñeca, el agarre y los tirones.';
  else if (ok) texto = 'Guante conectado. Calibra la mano recta para medir la muñeca.';
  $('estado-guante').textContent = guante.error || texto;
}
alCambiarGuante(pintarGuante);
$('guante').addEventListener('click', async () => {
  try {
    await alternarConexion();
  } catch (error) {
    $('estado-guante').textContent =
      error.name === 'NotFoundError'
        ? 'No elegiste un puerto. Conecta el guante por USB y vuelve a intentar.'
        : error.message;
  }
});
$('guante-demo').addEventListener('click', () => {
  // Demostración sin hardware: se aprende el giro de nuevo con el mouse.
  delete AJUSTES.guanteEje;
  delete AJUSTES.guanteCal;
  guardarAjustes();
  simularGuante(!guante.simulado);
});
$('muneca-recta').addEventListener('click', async () => {
  // Además se olvida el giro y el botón: la parte del guante los vuelve a medir.
  delete AJUSTES.guanteEje;
  delete AJUSTES.guanteCal;
  guardarAjustes();
  $('estado-guante').textContent = 'Deja la mano recta, en línea con el brazo, y quieta…';
  await calibrarMuneca();
  pintarGuante();
});
// Lecturas en vivo (5 veces por segundo).
setInterval(() => {
  if (!guante.conectado) return;
  const fresco = guanteActivo();
  $('lectura-guante').replaceChildren(
    ...[
      ['Muñeca', guante.neutro ? `${Math.round(desviacionGuante())}° de la recta` : 'sin calibrar'],
      ['Agarre (botón)', guante.grip ? 'apretado' : 'suelto'],
      ['Movimiento', `${Math.round(guante.gmag)} °/s`],
      ['Señal', fresco ? 'llegando' : 'sin datos: revisa el cable'],
    ].map(([k, v]) => {
      const fila = document.createElement('div');
      fila.className = 'flex justify-between gap-2';
      fila.append(
        Object.assign(document.createElement('span'), { textContent: k }),
        Object.assign(document.createElement('strong'), { textContent: v }),
      );
      return fila;
    }),
  );
}, 200);

// ---------- Cámaras (manos/camaras.js) y calibración (manos/calibracion.js) ----------
const umbral = (k, defecto) => AJUSTES.umbrales?.[k] ?? defecto;
const puno = new Histeresis(...umbral('puno', [1.35, 1.6]));
const lapices = new Histeresis(...umbral('pinza', [0.35, 0.5]));
const calibracion = new Calibracion();

function avisoCamaras(texto) {
  $('aviso-camaras').hidden = !texto;
  $('aviso-camaras').textContent = texto;
}

function empezarCalibracion() {
  calibracion.empezar();
  $('resultado-manos').hidden = true;
  $('otra-vez').hidden = true;
}

async function encender() {
  const boton = $('encender');
  boton.disabled = true;
  $('error-camara').hidden = true;
  try {
    const { fallas, dispositivos, pedidas } = await encenderCamaras((t) => {
      boton.textContent = t;
    });
    pintarAjustes(dispositivos);
    if (!camaras.length) throw new Error(fallas.join(' · ') || 'no hay cámaras conectadas');
    avisoCamaras(
      fallas.length ? `Se abrió ${camaras.length} de ${pedidas} cámaras. ${fallas.join(' · ')}` : '',
    );
    $('arranque').hidden = true;
    $('recalibrar').hidden = false;
    ajustarGeometria();
    if (calibrada()) reiniciar();
    else empezarCalibracion();
    arrancarCiclo();
  } catch (error) {
    boton.disabled = false;
    boton.textContent = 'Intentar otra vez';
    $('error-camara').hidden = false;
    $('error-camara').textContent =
      `No se pudo encender: ${motivo(error)}. Revisa "Ajustar cámaras" a la derecha.`;
  }
}
$('encender').addEventListener('click', encender);
// Otra vez: si se practica solo con el guante (sin cámaras), vuelve directo a esa parte.
$('otra-vez').addEventListener('click', () => {
  reiniciar();
  if (!camaras.length && EJ.guante) empezarGuante();
});
$('siguiente-guante').addEventListener('click', empezarGuante);
$('sin-guante').addEventListener('click', finalizar);
// Practicar solo la parte del guante (sin cámaras).
$('solo-guante').addEventListener('click', () => {
  reiniciar();
  empezarGuante();
  arrancarCiclo();
});
$('recalibrar').addEventListener('click', () => {
  verificando = false;
  pintarVerificar(false);
  empezarCalibracion();
});
// En el paso "¿cuál está arriba?" se toca la imagen de la izquierda o de la derecha.
lienzo.addEventListener('click', (e) => {
  if (!calibracion.activa || calibracion.paso !== 'rol') return;
  const r = lienzo.getBoundingClientRect();
  calibracion.elegirArriba((e.clientX - r.left) / r.width < 0.5 ? 0 : 1);
});

// Ajustes: qué cámaras usar, mejorar la imagen con poca luz y volver a calibrar.
function pintarAjustes(dispositivos) {
  const caja = $('ajustes-camaras');
  caja.replaceChildren();
  [0, 1].forEach((n) => {
    const fila = document.createElement('label');
    fila.className = 'grid gap-1 text-sm';
    fila.textContent = `Cámara ${n + 1}`;
    const sel = document.createElement('select');
    sel.className = 'border border-tinta bg-white px-2 py-1.5';
    sel.append(new Option('(ninguna)', ''));
    dispositivos.forEach((d) => sel.append(new Option(d.label || d.deviceId.slice(0, 8), d.deviceId)));
    sel.value = camaras[n]?.id ?? '';
    fila.append(sel);
    caja.append(fila);
  });
  const usar = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'boton-linea w-fit px-4 py-2 text-sm',
    textContent: 'Usar estas cámaras',
  });
  usar.addEventListener('click', () => {
    AJUSTES.ids = [...caja.querySelectorAll('select')].map((s) => s.value).filter(Boolean);
    guardarAjustes();
    window.location.reload();
  });
  const mejorar = document.createElement('label');
  mejorar.className = 'flex items-center gap-2 text-sm';
  const casilla = Object.assign(document.createElement('input'), {
    type: 'checkbox',
    checked: Boolean(AJUSTES.mejorar),
  });
  casilla.addEventListener('change', () => {
    AJUSTES.mejorar = casilla.checked;
    guardarAjustes();
  });
  mejorar.append(casilla, 'Mejorar la imagen con poca luz');
  const recalibrar = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'boton-linea w-fit px-4 py-2 text-sm',
    textContent: 'Calibrar otra vez (25 s)',
  });
  recalibrar.addEventListener('click', empezarCalibracion);
  caja.append(usar, mejorar, recalibrar);
}

// Un solo ciclo de dibujo aunque se encienda la cámara y también se use el guante.
let corriendo = false;
function arrancarCiclo() {
  if (corriendo) return;
  corriendo = true;
  requestAnimationFrame(ciclo);
}

let verificando = false;
const ultimaVista = { manos: [], en: 0 };

let revisadoEn = 0;
function revisarImagen(ahora) {
  if (ahora - revisadoEn < 1000) return;
  revisadoEn = ahora;
  const sin = sinImagen(ahora);
  if (sin.length)
    avisoCamaras(
      `${sin.map((c) => c.etiqueta.split('(')[0].trim()).join(' y ')} no manda imagen: conéctala a otro puerto USB (no al mismo hub que la otra) y recarga la página.`,
    );
}

function ciclo() {
  requestAnimationFrame(ciclo);
  const ahora = performance.now();
  if (modo === 'guante') {
    const r = faseGuante.actualizar(ahora);
    if (r?.terminado) terminarGuante(r);
    return;
  }
  if (!camaras.length) return;
  revisarImagen(ahora);
  if (!detectar(ahora)) return;
  if (calibracion.activa) {
    pasoCalibracion(ahora);
    return;
  }
  let manos = manosEnPantalla(camPosicion(), ahora);
  // Con guante la cámara pierde la mano a ratos: se sostiene la última posición hasta 0.8 s (el
  // agarre y la muñeca siguen llegando del guante), en vez de cortar el ejercicio.
  if (manos.length) Object.assign(ultimaVista, { manos, en: ahora });
  else if (guanteActivo() && ahora - ultimaVista.en < 800) manos = ultimaVista.manos;
  // Agarre con la vista de abajo (ve la palma); el guante, si está, también cuenta.
  const ag = agarre();
  const conGuante = guanteActivo() && guante.grip;
  const cerrada = (ag ? puno.actualizar(ag.apertura) : false) || conGuante;
  // El botón va en la palma: lo aprieta el mango (puño), no una pinza. La pinza es solo de la cámara.
  const lapiz = lapices.actualizar(Math.min(9, ...pinzas()));
  // LED del guante: prendido mientras el agarre es bueno.
  led(estado.agarrado || (EJ.tipo !== 'giro' && (EJ.tipo === 'punta' ? lapiz : cerrada)));
  dibujarPrincipal(ctx, lienzo.width, lienzo.height);
  if (verificando) pasoVerificar(manos, ag, cerrada, lapiz);
  else if (EJ.tipo === 'giro') pasoGiro(manos, cerrada, ahora);
  else if (EJ.tipo === 'secuencia') pasoSecuencia(manos, cerrada, ahora);
  else pasoPunta(manos, lapiz, ahora);
  manos.forEach(dibujarMano);
  dibujarRecuadro(ctx, lienzo.width, lienzo.height, EJ.tipo === 'punta' ? lapiz : cerrada);
}

// Al terminar de calibrar: la persona comprueba que se lee bien antes de empezar.
function pasoVerificar(manos, ag, cerrada, lapiz) {
  let texto = 'NO VEO TU MANO';
  let color = COLOR.mal;
  if (ag && lapiz) {
    texto = 'PINZA';
    color = COLOR.marca;
  } else if (ag && cerrada) {
    texto = 'CERRADA';
    color = COLOR.ok;
  } else if (ag) {
    texto = 'ABIERTA';
    color = COLOR.blanco;
  }
  ctx.fillStyle = 'rgba(20,28,36,.7)';
  ctx.fillRect(lienzo.width / 2 - 190, 24, 380, 84);
  ctx.fillStyle = color;
  ctx.font = '800 56px Archivo, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(texto, lienzo.width / 2, 88);
  ctx.textAlign = 'start';
  decir('Comprueba: abre, cierra y haz pinza; mueve la mano a tu derecha y hacia ti. ¿Se ve bien?');
}

function pintarVerificar(mostrar, aviso = '') {
  const caja = $('verificar');
  caja.hidden = !mostrar;
  if (!mostrar) return;
  caja.replaceChildren(
    Object.assign(document.createElement('p'), {
      className: 'font-semibold',
      textContent: 'Comprueba la calibración',
    }),
    Object.assign(document.createElement('p'), {
      className: 'text-sm text-tinta-2',
      textContent: `${aviso} Abre la mano, ciérrala y haz pinza: arriba debe decir ABIERTA, CERRADA y PINZA.`,
    }),
  );
  const bien = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'boton w-full px-4 py-3',
    textContent: 'Se ve bien, empezar',
  });
  bien.addEventListener('click', () => {
    verificando = false;
    pintarVerificar(false);
    reiniciar();
  });
  const otra = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'boton-linea w-full px-4 py-3',
    textContent: 'Calibrar otra vez',
  });
  otra.addEventListener('click', () => {
    verificando = false;
    pintarVerificar(false);
    empezarCalibracion();
  });
  // Si la mano en pantalla se mueve al revés, se voltea aquí mismo sin calibrar todo otra vez.
  const voltear = document.createElement('div');
  voltear.className = 'grid grid-cols-2 gap-2';
  [
    ['x', 'Voltear de lado'],
    ['y', 'Voltear de cabeza'],
  ].forEach(([eje, texto]) => {
    const b = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'boton-linea px-3 py-2 text-sm',
      textContent: texto,
    });
    b.addEventListener('click', () => {
      const cam = camPosicion();
      if (!cam) return;
      const v = volteo(cam);
      AJUSTES.voltear = { ...AJUSTES.voltear, [cam.id]: { ...v, [eje]: !v[eje] } };
      // El lugar donde descansa la mano también se voltea.
      const m = AJUSTES.mano?.[cam.id];
      if (m) m.centro = { ...m.centro, [eje]: 1 - m.centro[eje] };
      guardarAjustes();
      ajustarGeometria();
    });
    voltear.append(b);
  });
  caja.append(
    bien,
    Object.assign(document.createElement('p'), {
      className: 'text-sm',
      textContent: '¿La mano en la pantalla se mueve al revés que la tuya?',
    }),
    voltear,
    otra,
  );
}

function pasoCalibracion(ahora) {
  const r = calibracion.actualizar(ahora);
  if (r.listo) {
    Object.assign(puno, { bajo: umbral('puno', [1.35, 1.6])[0], alto: umbral('puno', [1.35, 1.6])[1] });
    Object.assign(lapices, { bajo: umbral('pinza', [0.35, 0.5])[0], alto: umbral('pinza', [0.35, 0.5])[1] });
    ajustarGeometria();
    // La cámara de arriba muy cerca: la mano se ve enorme y la herramienta no cabe.
    const m = AJUSTES.mano?.[camPosicion()?.id];
    const cerca =
      m && m.palma > 0.28 ? ' La cámara de arriba está muy cerca de la mano: súbela un poco.' : '';
    avisoCamaras(`${r.aviso}${cerca}`);
    sonar('bien');
    pintarElegirArriba(false);
    verificando = true;
    pintarVerificar(true, r.ok ? '' : 'Ojo: el puño casi no se distingue.');
    if (guanteActivo()) {
      avisoCamaras(`${r.aviso} Ahora el guante: deja la mano recta, en línea con el brazo, y quieta…`);
      calibrarMuneca().then(() => {
        avisoCamaras(`${r.aviso} Guante calibrado.`);
        pintarGuante();
      });
    }
    return;
  }
  pintarElegirArriba(calibracion.paso === 'rol' && r.fase !== 'ok');
  if (calibracion.paso === 'rol' && r.fase !== 'ok') dibujarDosVistas();
  else {
    dibujarPrincipal(ctx, lienzo.width, lienzo.height);
    manosEnPantalla(camPosicion(), ahora).forEach(dibujarMano);
  }
  // Número de paso, barra de avance, cuenta regresiva o palomita.
  ctx.fillStyle = 'rgba(20,28,36,.75)';
  ctx.fillRect(0, 0, lienzo.width, 46);
  ctx.fillStyle = COLOR.blanco;
  ctx.font = '700 20px Archivo, sans-serif';
  ctx.fillText(`Calibración · ${r.numero}`, 16, 30);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(0, 46, lienzo.width, 8);
  ctx.fillStyle = COLOR.marca;
  ctx.fillRect(0, 46, lienzo.width * Math.min(1, r.progreso), 8);
  ctx.textAlign = 'center';
  if (r.fase === 'prep') {
    ctx.fillStyle = 'rgba(20,28,36,.6)';
    circulo({ x: lienzo.width / 2, y: lienzo.height / 2 }, 90, 'rgba(20,28,36,.7)', COLOR.marca);
    ctx.fillStyle = COLOR.blanco;
    ctx.font = '800 110px Archivo, sans-serif';
    ctx.fillText(String(r.cuenta), lienzo.width / 2, lienzo.height / 2 + 38);
  } else if (r.fase === 'ok') {
    circulo({ x: lienzo.width / 2, y: lienzo.height / 2 }, 90, 'rgba(47,125,67,.9)', COLOR.blanco);
    ctx.fillStyle = COLOR.blanco;
    ctx.font = '800 110px Archivo, sans-serif';
    ctx.fillText('✓', lienzo.width / 2, lienzo.height / 2 + 38);
  }
  ctx.textAlign = 'start';
  decir(r.texto, r.fase === 'ok' ? 'ok' : 'guia');
}

// Las dos cámaras lado a lado para elegir cuál está arriba.
function dibujarDosVistas() {
  const w = lienzo.width / 2;
  ctx.fillStyle = COLOR.tinta;
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  camaras.slice(0, 2).forEach((cam, k) => {
    const h = (w * 3) / 4;
    const y = (lienzo.height - h) / 2;
    ctx.save();
    ctx.translate(k * w + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(cam.video, 0, 0, w, h);
    ctx.restore();
    ctx.strokeStyle = COLOR.marca;
    ctx.lineWidth = 4;
    ctx.strokeRect(k * w + 2, y, w - 4, h);
    ctx.fillStyle = COLOR.blanco;
    ctx.font = '700 22px Archivo, sans-serif';
    ctx.fillText(`Cámara ${k + 1} · ${cam.etiqueta.slice(0, 18)}`, k * w + 14, y + 32);
    ctx.font = '600 17px Archivo, sans-serif';
    ctx.fillText('Toca aquí si esta es la de ARRIBA', k * w + 14, y + h - 14);
  });
}

// ---------- Dibujo ----------

const HUESOS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [0, 17, 18, 19, 20],
  [5, 9, 13, 17],
];
function dibujarMano(mano) {
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineWidth = 3;
  HUESOS.forEach((cadena) => {
    ctx.beginPath();
    cadena.forEach((i, k) => {
      const p = aPx(mano[i]);
      if (k) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();
  });
}

function circulo(p, r, relleno, borde) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  if (relleno) {
    ctx.fillStyle = relleno;
    ctx.fill();
  }
  if (borde) {
    ctx.strokeStyle = borde;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

// ---------- Tipo "giro": torquímetro (apretar, con clic) y matraca (aflojar, sin clic) ----------
// Cada ejercicio trae solo los parámetros de su tipo: los del otro tipo quedan vacíos.
// inicial: hacia dónde apunta el mango al empezar (grados; 0 = a la derecha, 180 = a la izquierda).
// sentido: 1 aprieta (gira como el reloj, en pantalla); -1 afloja.
const punto = (par) => (par ? { x: par[0], y: par[1] } : null);
const entre = (v, a, b) => Math.min(b, Math.max(a, v));

// Geometría de la herramienta, a la medida de la mano: la calibración mide qué tan grande se ve
// la palma y dónde descansa. El torquímetro mide unas 4 palmas (≈ 45 cm contra ≈ 10 cm de palma)
// y se dibuja con la marca del mango justo donde descansa la mano. Sin calibrar, la del archivo.
const G = { pivote: null, largoU: 0, ancho: 0, centro: null, radio: 0, radioTuerca: 0 };
// Zona segura de la imagen (0 a 1): todo lo que la mano debe alcanzar queda aquí dentro, lejos de
// las orillas, donde la cámara pierde la mano. Abajo queda la barra de mensajes.
const SEGURA = { x0: 0.08, x1: 0.92, y0: 0.12, y1: 0.82 };

/**
 * Encaja una figura en la zona segura: la achica si no cabe y la recorre si se sale.
 * caja(escala) da sus límites relativos a su centro (unidades de alto); centroU es dónde se quiere.
 */
function encajar(caja, centroU) {
  const anchoDisp = (SEGURA.x1 - SEGURA.x0) * ASPECTO;
  const altoDisp = SEGURA.y1 - SEGURA.y0;
  const b0 = caja(1);
  const escala = Math.min(1, anchoDisp / (b0.maxX - b0.minX), altoDisp / (b0.maxY - b0.minY));
  const b = caja(escala);
  return {
    escala,
    centro: {
      x: entre(centroU.x, SEGURA.x0 * ASPECTO - b.minX, SEGURA.x1 * ASPECTO - b.maxX) / ASPECTO,
      y: entre(centroU.y, SEGURA.y0 - b.minY, SEGURA.y1 - b.maxY),
    },
  };
}

function ajustarGeometria() {
  const m = AJUSTES.mano?.[camPosicion()?.id];
  if (EJ.tipo === 'giro') {
    const medida = Boolean(m && P.largoPalmas);
    const largo = medida ? P.largoPalmas * m.palma : (P.largo ?? 0) * ASPECTO;
    const ini0 = P.inicial ?? 0;
    const sen = P.sentido ?? 1;
    // Todo el recorrido del mango (hasta pasarse un poco del clic) y la rueda deben caber.
    const caja = (escala) => {
      const L = largo * escala;
      const b = { minX: -0.22 * L, maxX: 0.22 * L, minY: -0.22 * L, maxY: 0.22 * L };
      for (let g = -10; g <= P.objetivo + 12; g += 4) {
        const a = ((ini0 + sen * g) * Math.PI) / 180;
        const x = Math.cos(a) * L * 1.08;
        const y = Math.sin(a) * L * 1.08;
        Object.assign(b, {
          minX: Math.min(b.minX, x),
          maxX: Math.max(b.maxX, x),
          minY: Math.min(b.minY, y),
          maxY: Math.max(b.maxY, y),
        });
      }
      return b;
    };
    // Pivote deseado: la marca del mango donde descansa la mano (o el del archivo).
    let pivU = U(punto(P.pivote));
    if (medida) {
      const a = (ini0 * Math.PI) / 180;
      const enMarca = (P.zona[0] + P.zona[1]) / 2;
      const c = U(m.centro);
      pivU = { x: c.x - Math.cos(a) * largo * enMarca, y: c.y - Math.sin(a) * largo * enMarca };
    }
    const { escala, centro } = encajar(caja, pivU);
    G.largoU = largo * escala;
    G.ancho = medida ? Math.max(0.05, 0.9 * m.palma) : P.ancho;
    G.pivote = centro;
  }
  if (EJ.tipo === 'secuencia') {
    const medida = Boolean(m && P.radioPalmas);
    const radio = medida ? P.radioPalmas * m.palma : P.radio;
    const tuerca = medida ? entre(P.tuercaPalmas * m.palma, 0.035, 0.08) : P.radioTuerca;
    const caja = (escala) => {
      const r = (radio + tuerca * 1.6) * escala;
      return { minX: -r, maxX: r, minY: -r, maxY: r };
    };
    const { escala, centro } = encajar(caja, U(medida ? m.centro : punto(P.centro)));
    G.radio = radio * escala;
    G.radioTuerca = tuerca;
    G.centro = centro;
  }
}
ajustarGeometria();
const INICIAL = P.inicial ?? 0;
const SENTIDO = P.sentido ?? 1;
const CON_CLIC = P.clic !== false;
const anguloMango = (avance) => INICIAL + SENTIDO * avance;
const diferencia = (a, b) => ((a - b + 540) % 360) - 180; // sin el salto de 180 a -180

function dibujarTorquimetro(avance, agarrado) {
  const piv = aPx(G.pivote);
  const L = G.largoU * lienzo.height;
  const rad = (g) => (g * Math.PI) / 180;
  ctx.save();
  ctx.translate(piv.x, piv.y);
  // Tuerca y rueda (de fondo).
  circulo({ x: 0, y: 0 }, L * 0.2, 'rgba(51,64,76,.85)', '#c9d1d8');
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    circulo({ x: Math.cos(a) * L * 0.13, y: Math.sin(a) * L * 0.13 }, L * 0.025, '#8e959c');
  }
  ctx.rotate(rad(anguloMango(avance)));
  // Barra y cabeza.
  ctx.fillStyle = '#8e959c';
  ctx.fillRect(0, -L * 0.035, L, L * 0.07);
  circulo({ x: 0, y: 0 }, L * 0.07, '#5b636b', COLOR.blanco);
  // Mango negro con la marca amarilla donde se toma.
  ctx.fillStyle = COLOR.tinta;
  ctx.fillRect(L * 0.62, -L * 0.05, L * 0.38, L * 0.1);
  ctx.fillStyle = agarrado ? COLOR.ok : COLOR.marca;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(L * P.zona[0], -L * 0.06, L * (P.zona[1] - P.zona[0]), L * 0.12);
  ctx.globalAlpha = 1;
  ctx.restore();
  // Escala de avance hasta el clic (o hasta que la tuerca se suelta).
  const desde = rad(INICIAL);
  const hasta = rad(anguloMango(P.objetivo));
  const lleno = rad(anguloMango(Math.max(0, Math.min(avance, P.objetivo))));
  ctx.save();
  ctx.translate(piv.x, piv.y);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath();
  ctx.arc(0, 0, L * 1.06, desde, hasta, SENTIDO < 0);
  ctx.stroke();
  ctx.strokeStyle = COLOR.marca;
  ctx.beginPath();
  ctx.arc(0, 0, L * 1.06, desde, lleno, SENTIDO < 0);
  ctx.stroke();
  ctx.restore();
}

function pasoGiro(manos, cerrada, ahora) {
  const mano = manos[0];
  dibujarTorquimetro(estado.angulo, estado.agarrado);
  if (estado.fase === 'resultado') return;
  if (!mano) {
    if (estado.fase === 'jala' || estado.fase === 'clic')
      frase('No veo tu mano desde arriba: ponla otra vez entre las cámaras');
    else frase('Pon tu mano entre las dos cámaras, abierta');
    return;
  }
  const c = U(palma(mano));
  const piv = U(G.pivote);
  const { t, lejos } = sobreMango(c, piv, anguloMango(estado.angulo), G.largoU);
  const enMango = lejos < G.ancho && t > 0.15 && t < 1.15;
  const enZona = enMango && t >= P.zona[0] - 0.04 && t <= P.zona[1] + 0.08;

  if (estado.fase === 'acerca' || estado.fase === 'toma') {
    estado.fase = 'toma';
    if (enMango && cerrada && !enZona) {
      // Tomó el mango, pero no en la marca: lee mal el torque (o se pierde palanca).
      if (!estado.zonaMalDesde) estado.zonaMalDesde = ahora;
      if (ahora - estado.zonaMalDesde > 500) fallar('zona');
    } else estado.zonaMalDesde = 0;
    if (enZona && cerrada) {
      if (!estado.enZonaDesde) estado.enZonaDesde = ahora;
      if (ahora - estado.enZonaDesde > 400) {
        estado.fase = 'jala';
        estado.agarrado = true;
        // Donde quedó el mango menos lo que ya avanzó: al volver a tomarlo no brinca.
        estado.inicio = anguloAlrededor(c, piv) - SENTIDO * estado.angulo;
        if (guanteActivo() && !guante.neutro) guante.neutro = { roll: guante.roll, pitch: guante.pitch };
        estado.historial = [];
        sonar('mano');
      }
    } else estado.enZonaDesde = 0;
    if (enZona && !cerrada) frase('Ahora cierra la mano en el mango');
    else if (!enMango) frase('Lleva la mano a la marca amarilla del mango');
    else frase('Toma el mango en la marca amarilla');
    return;
  }

  // Jalando (o ya después del clic): la herramienta sigue a la mano.
  const avance = SENTIDO * diferencia(anguloAlrededor(c, piv), estado.inicio);
  estado.angulo = Math.max(-25, Math.min(P.objetivo + 25, avance));
  estado.historial.push([ahora, avance]);
  while (estado.historial.length && ahora - estado.historial[0][0] > 150) estado.historial.shift();

  if (!cerrada) {
    if (!estado.abiertaDesde) estado.abiertaDesde = ahora;
  } else estado.abiertaDesde = 0;
  const abierta = estado.abiertaDesde && ahora - estado.abiertaDesde > 300;

  if (estado.fase === 'clic') {
    if (CON_CLIC) {
      estado.pasado = Math.max(estado.pasado, avance - P.objetivo);
      if (estado.pasado > P.pasarse) fallar('clic');
    }
    if (abierta || ahora - estado.tClic > 1600) terminar();
    else frase(CON_CLIC ? '¡Clic! Suelta el mango' : (P.textoFin ?? '¡Listo!'), 'ok');
    return;
  }

  const empuja = avance < -6;
  if (empuja) {
    fallar('sentido');
    // Si de plano hay que empujar, con la palma abierta: con el puño, al zafarse, la mano se golpea.
    if (cerrada) fallar('puno');
  }
  if (abierta && !empuja) {
    // Soltó a medio jalón: cuenta como agarre flojo y vuelve a tomarlo donde quedó.
    fallar('agarre');
    estado.fase = 'toma';
    estado.agarrado = false;
    estado.enZonaDesde = 0;
    return;
  }
  if (!enZona && enMango) fallar('zona');
  const [, primero] = estado.historial[0] ?? [ahora, avance];
  if (Math.abs(avance - primero) > P.tiron) fallar('parejo');
  // Tirones: con el guante, por la velocidad de giro de la mano (mucho más fina que la cámara).
  if (guanteActivo() && guante.gmag > (P.tironGuante ?? 220)) fallar('parejo');
  const torcida =
    guanteActivo() && guante.neutro
      ? desviacionGuante() > P.munecaGuante
      : desviacionMuneca(mano, ASPECTO, anguloMango(estado.angulo)) > P.muneca;
  if (torcida) {
    if (!estado.munecaDesde) estado.munecaDesde = ahora;
    if (ahora - estado.munecaDesde > 500) fallar('muneca');
  } else estado.munecaDesde = 0;

  if (avance >= P.objetivo) {
    estado.fase = 'clic';
    estado.tClic = ahora;
    sonar(CON_CLIC ? 'clic' : 'llave');
    pitar(); // en la mano, como un torquímetro de verdad
    return;
  }
  frase(
    avance < 2
      ? (P.textoJalar ?? 'Jala hacia ti, parejo')
      : `Sigue jalando parejo… ${Math.round((avance / P.objetivo) * 100)} %`,
  );
}

// ---------- Tipo "secuencia": apretar las tuercas de la rueda en estrella ----------
// Se aprieta una tuerca poniendo la mano cerrada sobre ella (como al tomar la llave). La primera es
// libre; las siguientes van en estrella, cada una "enfrente" de la anterior, para que la rueda
// asiente pareja (Fleet Maintenance; manual Ram; DBA).
const TUERCAS = P.tuercas ?? 10;
const posTuerca = (k) => {
  const a = -Math.PI / 2 + (k / TUERCAS) * Math.PI * 2;
  return { x: G.centro.x + (Math.cos(a) * G.radio) / ASPECTO, y: G.centro.y + Math.sin(a) * G.radio };
};
const esperada = () =>
  estado.base == null ? null : (estado.base + P.orden[estado.apretadas.length]) % TUERCAS;

function dibujarRueda(sobre, ahora) {
  const c = aPx(G.centro);
  const R = G.radio * lienzo.height;
  circulo(c, R * 1.45, 'rgba(51,64,76,.85)', '#c9d1d8');
  circulo(c, R * 0.55, '#5b636b', COLOR.blanco);
  const pista = estado.pista && ahora < estado.pista ? esperada() : null;
  for (let k = 0; k < TUERCAS; k += 1) {
    const p = aPx(posTuerca(k));
    const n = estado.apretadas.indexOf(k);
    let relleno = '#8e959c';
    if (n >= 0) relleno = COLOR.ok;
    else if (k === pista && Math.floor(ahora / 250) % 2) relleno = COLOR.marca;
    else if (k === sobre) relleno = '#c9d1d8';
    circulo(p, G.radioTuerca * lienzo.height, relleno, COLOR.blanco);
    if (n >= 0) {
      ctx.fillStyle = COLOR.blanco;
      ctx.font = '700 22px Archivo, sans-serif';
      ctx.fillText(String(n + 1), p.x - 7, p.y + 8);
    }
  }
  // Avance de la tuerca que se está apretando.
  if (estado.apretando != null && estado.desde) {
    const p = aPx(posTuerca(estado.apretando));
    const f = Math.min(1, (ahora - estado.desde) / (P.sostener * 1000));
    ctx.strokeStyle = COLOR.marca;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, G.radioTuerca * lienzo.height + 8, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
    ctx.stroke();
  }
}

function pasoSecuencia(manos, cerrada, ahora) {
  const mano = manos[0];
  const c = mano ? U(palma(mano)) : null;
  // La tuerca bajo la mano (la más cercana, si está a menos de 1.6 radios de tuerca).
  let sobre = null;
  if (c) {
    let mejor = Infinity;
    for (let k = 0; k < TUERCAS; k += 1) {
      const d = distancia(c, U(posTuerca(k)));
      if (d < mejor && d < G.radioTuerca * 1.6) {
        mejor = d;
        sobre = k;
      }
    }
  }
  dibujarRueda(sobre, ahora);
  if (estado.fase === 'resultado') return;
  estado.fase = 'aprieta';
  if (!mano) {
    frase('Pon tu mano entre las dos cámaras');
    return;
  }
  if (sobre == null || !cerrada) {
    estado.apretando = null;
    estado.desde = 0;
    frase(
      estado.apretadas.length
        ? `Van ${estado.apretadas.length} de ${TUERCAS}: sigue en estrella, con la mano cerrada sobre la tuerca`
        : 'Cierra la mano sobre cualquier tuerca para empezar',
    );
    return;
  }
  if (estado.apretadas.includes(sobre)) {
    frase('Esa ya está apretada: busca la de enfrente');
    return;
  }
  if (estado.apretando !== sobre) {
    estado.apretando = sobre;
    estado.desde = ahora;
  }
  if (ahora - estado.desde < P.sostener * 1000) {
    frase('Aprieta…');
    return;
  }
  // Ya la "apretó": ¿era la que tocaba en la estrella?
  const toca = esperada();
  estado.apretando = null;
  estado.desde = 0;
  if (toca != null && sobre !== toca) {
    fallar('orden');
    estado.pista = ahora + 2500; // se ilumina la que tocaba
    return;
  }
  if (estado.base == null) estado.base = sobre;
  estado.apretadas.push(sobre);
  sonar('clic');
  pitar();
  if (estado.apretadas.length >= TUERCAS) terminar();
}

// ---------- Tipo "punta": multímetro con una sola mano ----------
const zona = P.zonaCircuito;
const positivo = punto(P.positivo);
const negativo = punto(P.negativo);

function dibujarCircuito(punta, lectura) {
  const [x0, y0, x1, y1] = zona;
  const a = aPx({ x: x0, y: y0 });
  const b = aPx({ x: x1, y: y1 });
  ctx.strokeStyle = 'rgba(224,168,0,.8)';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.setLineDash([]);
  ctx.fillStyle = COLOR.marca;
  ctx.font = '600 20px Archivo, sans-serif';
  ctx.fillText('Zona del circuito: solo una mano', a.x + 10, b.y - 12);
  // Batería de 24 V.
  const bat0 = aPx({ x: positivo.x - 0.08, y: positivo.y + 0.04 });
  const bat1 = aPx({ x: negativo.x + 0.08, y: positivo.y + 0.32 });
  ctx.fillStyle = '#33404c';
  ctx.fillRect(bat0.x, bat0.y, bat1.x - bat0.x, bat1.y - bat0.y);
  ctx.fillStyle = COLOR.blanco;
  ctx.font = '700 26px Archivo, sans-serif';
  ctx.fillText('24 V', (bat0.x + bat1.x) / 2 - 28, (bat0.y + bat1.y) / 2 + 10);
  const radio = P.radio * lienzo.height;
  circulo(aPx(positivo), radio * 0.6, COLOR.mal, COLOR.blanco);
  circulo(aPx(negativo), radio * 0.6, COLOR.tinta, COLOR.blanco);
  ctx.fillStyle = COLOR.blanco;
  ctx.fillText('+', aPx(positivo).x - 8, aPx(positivo).y - radio);
  ctx.fillText('−', aPx(negativo).x - 8, aPx(negativo).y - radio);
  // Punta negra fija con caimán al negativo y el multímetro.
  const neg = aPx(negativo);
  const medidor = aPx({ x: 0.08, y: 0.62 });
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(neg.x, neg.y);
  ctx.quadraticCurveTo(neg.x, medidor.y + 120, medidor.x + 60, medidor.y + 150);
  ctx.stroke();
  ctx.fillStyle = COLOR.marca;
  ctx.fillRect(medidor.x, medidor.y, 130, 160);
  ctx.fillStyle = '#0f1a14';
  ctx.fillRect(medidor.x + 12, medidor.y + 14, 106, 50);
  ctx.fillStyle = '#7dff9a';
  ctx.font = '700 26px monospace';
  ctx.fillText(lectura ?? '--.- V', medidor.x + 18, medidor.y + 50);
  // Punta roja en la mano que la toma.
  if (punta) {
    const p = aPx(punta);
    ctx.strokeStyle = COLOR.mal;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(p.x - 40, medidor.y + 160, medidor.x + 90, medidor.y + 150);
    ctx.stroke();
    circulo(p, 9, COLOR.mal, COLOR.blanco);
  }
}

function pasoPunta(manos, lapizVisto, ahora) {
  // La mano que mide: la que tiene el índice más cerca del borne positivo.
  const conPunta = manos
    .map((m, k) => ({ m, k, punta: m[8], d: distancia(U(m[8]), U(positivo)) }))
    .sort((a, b) => a.d - b.d);
  const mide = conPunta[0];
  const lapiz = Boolean(mide) && lapizVisto;
  dibujarCircuito(mide && lapiz ? mide.punta : null, estado.lectura);
  if (estado.fase === 'resultado') return;
  estado.fase = 'mide';
  if (!mide) {
    frase('Pon frente a la cámara la mano con la que mides');
    return;
  }
  const enCircuito = (m) => dentro(m[8], zona) || dentro(palma(m), zona);
  const manosDentro = manos.filter(enCircuito).length;
  if (manosDentro >= 2) {
    fallar('unaMano');
    estado.sosteniendo = 0;
    frase('Saca la otra mano del circuito');
    return;
  }
  if (!dentro(mide.punta, zona)) {
    estado.sinLapizDesde = 0;
    frase(
      lapiz
        ? 'Lleva la punta roja al borne positivo (+)'
        : 'Toma la punta roja como lápiz: pulgar e índice juntos',
    );
    return;
  }
  if (!lapiz) {
    if (!estado.sinLapizDesde) estado.sinLapizDesde = ahora;
    if (ahora - estado.sinLapizDesde > 500) fallar('lapiz');
    frase('Toma la punta como lápiz: pulgar e índice juntos');
    return;
  }
  estado.sinLapizDesde = 0;
  const radioU = P.radio;
  if (distancia(U(mide.punta), U(negativo)) < radioU) {
    fallar('borne');
    estado.sosteniendo = 0;
    return;
  }
  if (distancia(U(mide.punta), U(positivo)) < radioU) {
    if (!estado.sosteniendo) estado.sosteniendo = ahora;
    const s = (ahora - estado.sosteniendo) / 1000;
    if (s >= P.sostener) {
      estado.lectura = P.lectura;
      sonar('multimetro');
      terminar();
      return;
    }
    frase(`Sostén la punta en el (+)… ${Math.max(0, P.sostener - s).toFixed(1)} s`, 'ok');
    return;
  }
  estado.sosteniendo = 0;
  frase('Lleva la punta roja al borne positivo (+)');
}

// ---------- Resultado y guardado ----------
async function guardar(nota, fallasCamara, fallasGuante) {
  const enviar = (url, metodo, cuerpo) =>
    fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
  const intento = Date.now();
  const todas = [
    ...fallasCamara.map((id) => EJ.reglas.find((x) => x.id === id)),
    ...fallasGuante.map((id) => EJ.guante.reglas.find((x) => x.id === id)),
  ].filter(Boolean);
  const acciones = todas.length
    ? todas.map((r) => {
        const { id } = r;
        return {
          sistema: EJ.sistema,
          actividad: 'manos',
          intento,
          herramienta: EJ.id,
          paso: id,
          resultado: r.critico ? 'critico' : 'error',
          detalle: r.detalle,
        };
      })
    : [
        {
          sistema: EJ.sistema,
          actividad: 'manos',
          intento,
          herramienta: EJ.id,
          paso: 'postura',
          resultado: 'correcta',
          detalle: `${EJ.herramienta}: postura correcta`,
        },
      ];
  await enviar(`${API}/acciones`, 'POST', { acciones });
  // El avance del sistema guarda la mejor calificación de manos (punto "Manos" de Mi camino).
  const datos = await fetch(API)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const p = datos?.progreso?.[EJ.sistema] ?? { conoce: [], encuentra: false, comprueba: null };
  // La mejor calificación de cada ejercicio de manos del sistema (y la mejor de todas).
  p.manosPor = { ...p.manosPor, [EJ.id]: Math.max(p.manosPor?.[EJ.id] ?? 0, nota) };
  p.manos = Math.max(p.manos ?? 0, nota);
  // Cada parte por separado (para el panel: técnica visible y técnica de fuerza y postura).
  p.manosPartes = {
    ...p.manosPartes,
    [EJ.id]: { camaras: partes.camaras?.nota ?? null, guante: partes.guante?.nota ?? null },
  };
  await enviar(`${API}/progreso/${EJ.sistema}`, 'PUT', { datos: p });
}

function lista(fallas, reglas, siVacia) {
  const ul = document.createElement('ul');
  ul.className = 'grid gap-1 text-[15px]';
  (fallas.length ? fallas.map((id) => `• ${reglas.find((r) => r.id === id).frase}`) : [siVacia]).forEach(
    (t) => ul.append(Object.assign(document.createElement('li'), { textContent: t })),
  );
  return ul;
}

// Fin de la parte 1 (cámaras).
function terminar() {
  estado.fase = 'resultado';
  estado.agarrado = false;
  const nota = calificar(EJ.reglas, estado.fallas);
  partes.camaras = { nota, fallas: [...estado.fallas] };
  if (!EJ.guante) {
    finalizar();
    return;
  }
  sonar(nota >= APROBACION ? 'bien' : 'mal');
  decir(`Parte 1 lista: ${nota} de 100. Ahora ponte el guante`, nota >= APROBACION ? 'ok' : 'guia');
  const caja = $('resultado-manos');
  caja.replaceChildren(
    Object.assign(document.createElement('p'), {
      className: 'font-sans text-xl font-semibold',
      textContent: `Parte 1 · Cámaras: ${nota} de 100`,
    }),
    lista(partes.camaras.fallas, EJ.reglas, 'Dónde y en qué orden: correcto.'),
  );
  caja.hidden = false;
  $('pasos-guante').hidden = false;
}

function empezarGuante() {
  modo = 'guante';
  faseGuante = new FaseGuante(EJ, { ctx, lienzo, decir, sonar });
  faseGuante.empezar(performance.now());
  $('pasos-guante').hidden = true;
  $('arranque').hidden = true;
}

// Fin de la parte 2 (guante).
function terminarGuante(r) {
  modo = 'camaras';
  partes.guante = { nota: r.nota, fallas: r.fallas };
  finalizar();
}

// Resultado final: cada parte y el promedio de las que se hicieron.
function finalizar() {
  estado.fase = 'resultado';
  const hechas = [partes.camaras, partes.guante].filter(Boolean);
  const nota = Math.round(hechas.reduce((a, p) => a + p.nota, 0) / hechas.length);
  const aprobado = nota >= APROBACION;
  sonar(aprobado ? 'bien' : 'mal');
  decir(
    aprobado
      ? `¡Bien hecho! ${nota} de 100`
      : `${nota} de 100: se aprueba con ${APROBACION}. Inténtalo otra vez`,
    aprobado ? 'ok' : 'mal',
  );
  const caja = $('resultado-manos');
  caja.replaceChildren(
    Object.assign(document.createElement('p'), {
      className: `font-sans text-2xl font-semibold ${aprobado ? 'text-ok' : 'text-mal'}`,
      textContent: `${nota} de 100 · ${aprobado ? 'Aprobado' : 'Todavía no'}`,
    }),
  );
  if (partes.camaras) {
    caja.append(
      Object.assign(document.createElement('p'), {
        className: 'mt-2 font-semibold',
        textContent: `Parte 1 · Cámaras (dónde y en qué orden): ${partes.camaras.nota}`,
      }),
      lista(partes.camaras.fallas, EJ.reglas, 'Correcto.'),
    );
  }
  if (partes.guante) {
    caja.append(
      Object.assign(document.createElement('p'), {
        className: 'mt-2 font-semibold',
        textContent: `Parte 2 · Guante (fuerza y postura): ${partes.guante.nota}`,
      }),
      lista(partes.guante.fallas, EJ.guante.reglas, 'Correcto.'),
    );
  } else if (EJ.guante) {
    caja.append(
      Object.assign(document.createElement('p'), {
        className: 'mt-2 text-sm text-tinta-3',
        textContent: 'Parte 2 · Guante: no se hizo.',
      }),
    );
  }
  caja.hidden = false;
  $('otra-vez').hidden = false;
  $('pasos-guante').hidden = true;
  guardar(nota, partes.camaras?.fallas ?? [], partes.guante?.fallas ?? []);
}

// Botones para elegir a mano cuál cámara está arriba (además de la detección automática).
function pintarElegirArriba(mostrar) {
  const caja = $('elegir-arriba');
  caja.hidden = !mostrar;
  if (!mostrar || caja.childElementCount) return;
  caja.append(
    Object.assign(document.createElement('p'), {
      className: 'text-sm font-semibold',
      textContent: '¿Cuál cámara está ARRIBA, apuntando hacia abajo?',
    }),
  );
  camaras.slice(0, 2).forEach((cam, k) => {
    const b = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'boton w-full px-4 py-3 text-left',
      textContent: `Arriba: cámara ${k + 1} (${cam.etiqueta.split('(')[0].trim()})`,
    });
    b.addEventListener('click', () => calibracion.elegirArriba(k));
    caja.append(b);
  });
}
