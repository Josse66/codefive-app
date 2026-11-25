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
  motivo,
  pinzas,
} from '../manos/camaras.js';
import { Calibracion } from '../manos/calibracion.js';
import { SerialGlove } from '../entradas/serialGlove.js';
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
};

function reiniciar() {
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

// ---------- Guante (opcional): muñeca con el giroscopio y agarre con su sensor ----------
const guante = { conectado: false, roll: 0, pitch: 0, grip: false, neutro: null };
const serial = new SerialGlove();
serial.addEventListener('dato', ({ detail }) => {
  Object.assign(guante, { roll: detail.roll ?? 0, pitch: detail.pitch ?? 0, grip: Boolean(detail.grip) });
});
serial.addEventListener('estado', ({ detail }) => {
  guante.conectado = detail.conectado;
  $('estado-guante').textContent = detail.conectado
    ? 'Guante conectado: mide la muñeca y el agarre.'
    : 'Sin guante: todo se revisa con la cámara.';
  $('guante').textContent = detail.conectado ? 'Desconectar guante' : 'Conectar guante';
});
$('guante').addEventListener('click', async () => {
  try {
    if (guante.conectado) await serial.desconectar();
    else await serial.conectar();
  } catch (error) {
    $('estado-guante').textContent = error.message;
  }
});
const desviacionGuante = () =>
  guante.neutro
    ? Math.max(Math.abs(guante.roll - guante.neutro.roll), Math.abs(guante.pitch - guante.neutro.pitch))
    : 0;

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
    if (calibrada()) reiniciar();
    else empezarCalibracion();
    requestAnimationFrame(ciclo);
  } catch (error) {
    boton.disabled = false;
    boton.textContent = 'Intentar otra vez';
    $('error-camara').hidden = false;
    $('error-camara').textContent =
      `No se pudo encender: ${motivo(error)}. Revisa "Ajustar cámaras" a la derecha.`;
  }
}
$('encender').addEventListener('click', encender);
$('otra-vez').addEventListener('click', reiniciar);
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

function ciclo() {
  requestAnimationFrame(ciclo);
  const ahora = performance.now();
  if (!detectar(ahora)) return;
  if (calibracion.activa) {
    pasoCalibracion(ahora);
    return;
  }
  const manos = manosEnPantalla(camPosicion(), ahora);
  // Agarre con la vista de abajo (ve la palma); el guante, si está, también cuenta.
  const ag = agarre();
  const cerrada = (ag ? puno.actualizar(ag.apertura) : false) || (guante.conectado && guante.grip);
  const lapiz = lapices.actualizar(Math.min(9, ...pinzas())) || (guante.conectado && guante.grip);
  dibujarPrincipal(ctx, lienzo.width, lienzo.height);
  if (EJ.tipo === 'giro') pasoGiro(manos, cerrada, ahora);
  else pasoPunta(manos, lapiz, ahora);
  manos.forEach(dibujarMano);
  dibujarRecuadro(ctx, lienzo.width, lienzo.height, EJ.tipo === 'giro' ? cerrada : lapiz);
}

function pasoCalibracion(ahora) {
  const r = calibracion.actualizar(ahora);
  if (r.listo) {
    Object.assign(puno, { bajo: umbral('puno', [1.35, 1.6])[0], alto: umbral('puno', [1.35, 1.6])[1] });
    Object.assign(lapices, { bajo: umbral('pinza', [0.35, 0.5])[0], alto: umbral('pinza', [0.35, 0.5])[1] });
    avisoCamaras(r.aviso);
    sonar('bien');
    reiniciar();
    return;
  }
  if (calibracion.paso === 'rol') dibujarDosVistas();
  else {
    dibujarPrincipal(ctx, lienzo.width, lienzo.height);
    manosEnPantalla(camPosicion(), ahora).forEach(dibujarMano);
  }
  // Barra de avance del paso.
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(0, 0, lienzo.width, 10);
  ctx.fillStyle = COLOR.marca;
  ctx.fillRect(0, 0, lienzo.width * Math.min(1, r.progreso), 10);
  decir(`Calibración · ${r.texto}`);
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
    ctx.fillText(`${k + 1} · ${cam.etiqueta.slice(0, 22)}`, k * w + 14, y + 32);
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

// ---------- Tipo "giro": torquímetro ----------
// Cada ejercicio trae solo los parámetros de su tipo: los del otro tipo quedan vacíos.
const punto = (par) => (par ? { x: par[0], y: par[1] } : null);
const pivote = punto(P.pivote);
const largoU = (P.largo ?? 0) * ASPECTO; // el largo se da en ancho de imagen

function dibujarTorquimetro(anguloGrados, agarrado) {
  const piv = aPx(pivote);
  const L = P.largo * lienzo.width;
  ctx.save();
  ctx.translate(piv.x, piv.y);
  // Tuerca y rueda (de fondo).
  circulo({ x: 0, y: 0 }, L * 0.2, 'rgba(51,64,76,.85)', '#c9d1d8');
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    circulo({ x: Math.cos(a) * L * 0.13, y: Math.sin(a) * L * 0.13 }, L * 0.025, '#8e959c');
  }
  ctx.rotate((anguloGrados * Math.PI) / 180);
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
  // Escala de avance hasta el clic.
  ctx.save();
  ctx.translate(piv.x, piv.y);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, L * 1.06, 0, (P.objetivo * Math.PI) / 180);
  ctx.stroke();
  ctx.strokeStyle = COLOR.marca;
  ctx.beginPath();
  ctx.arc(0, 0, L * 1.06, 0, (Math.max(0, Math.min(anguloGrados, P.objetivo)) * Math.PI) / 180);
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
  const piv = U(pivote);
  const { t, lejos } = sobreMango(c, piv, estado.angulo, largoU);
  const enMango = lejos < P.ancho && t > 0.15 && t < 1.15;
  const enZona = enMango && t >= P.zona[0] - 0.04 && t <= P.zona[1] + 0.08;

  if (estado.fase === 'acerca' || estado.fase === 'toma') {
    estado.fase = 'toma';
    if (enMango && cerrada && !enZona) {
      // Tomó el mango, pero no en la marca: lee mal el torque.
      if (!estado.zonaMalDesde) estado.zonaMalDesde = ahora;
      if (ahora - estado.zonaMalDesde > 500) fallar('zona');
    } else estado.zonaMalDesde = 0;
    if (enZona && cerrada) {
      if (!estado.enZonaDesde) estado.enZonaDesde = ahora;
      if (ahora - estado.enZonaDesde > 400) {
        estado.fase = 'jala';
        estado.agarrado = true;
        estado.inicio ??= anguloAlrededor(c, piv);
        guante.neutro = guante.conectado ? { roll: guante.roll, pitch: guante.pitch } : null;
        estado.historial = [];
        sonar('mano');
      }
    } else estado.enZonaDesde = 0;
    if (enZona && !cerrada) frase('Ahora cierra la mano en el mango');
    else if (!enMango) frase('Lleva la mano a la marca amarilla del mango');
    else frase('Toma el mango en la marca amarilla');
    return;
  }

  // Jalando (o ya después del clic): el torquímetro sigue a la mano.
  const avance = anguloAlrededor(c, piv) - estado.inicio;
  estado.angulo = Math.max(-25, Math.min(P.objetivo + 25, avance));
  estado.historial.push([ahora, avance]);
  while (estado.historial.length && ahora - estado.historial[0][0] > 150) estado.historial.shift();

  if (!cerrada) {
    if (!estado.abiertaDesde) estado.abiertaDesde = ahora;
  } else estado.abiertaDesde = 0;
  const abierta = estado.abiertaDesde && ahora - estado.abiertaDesde > 300;

  if (estado.fase === 'clic') {
    estado.pasado = Math.max(estado.pasado, avance - P.objetivo);
    if (estado.pasado > P.pasarse) fallar('clic');
    if (abierta || ahora - estado.tClic > 1600) terminar();
    else frase('¡Clic! Suelta el mango', 'ok');
    return;
  }

  if (abierta) {
    // Soltó a medio jalón: cuenta como agarre flojo y vuelve a tomarlo donde quedó.
    fallar('agarre');
    estado.fase = 'toma';
    estado.agarrado = false;
    estado.enZonaDesde = 0;
    return;
  }
  if (!enZona && enMango) fallar('zona');
  if (avance < -6) fallar('sentido');
  const [, primero] = estado.historial[0] ?? [ahora, avance];
  if (Math.abs(avance - primero) > P.tiron) fallar('parejo');
  const torcida = guante.neutro
    ? desviacionGuante() > P.munecaGuante
    : desviacionMuneca(mano, ASPECTO, estado.angulo) > P.muneca;
  if (torcida) {
    if (!estado.munecaDesde) estado.munecaDesde = ahora;
    if (ahora - estado.munecaDesde > 500) fallar('muneca');
  } else estado.munecaDesde = 0;

  if (avance >= P.objetivo) {
    estado.fase = 'clic';
    estado.tClic = ahora;
    sonar('clic');
    return;
  }
  frase(
    avance < 2
      ? 'Jala hacia abajo, hacia ti, parejo'
      : `Sigue jalando parejo… ${Math.round((avance / P.objetivo) * 100)} %`,
  );
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
async function guardar(nota) {
  const enviar = (url, metodo, cuerpo) =>
    fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }).catch(() => null);
  const intento = Date.now();
  const acciones = estado.fallas.size
    ? [...estado.fallas].map((id) => {
        const r = EJ.reglas.find((x) => x.id === id);
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
  p.manos = Math.max(p.manos ?? 0, nota);
  await enviar(`${API}/progreso/${EJ.sistema}`, 'PUT', { datos: p });
}

function terminar() {
  estado.fase = 'resultado';
  estado.agarrado = false;
  const nota = calificar(EJ.reglas, estado.fallas);
  const aprobado = nota >= APROBACION;
  sonar(aprobado ? 'bien' : 'mal');
  decir(
    aprobado
      ? `¡Bien hecho! ${nota} de 100`
      : `${nota} de 100: se aprueba con ${APROBACION}. Inténtalo otra vez`,
    aprobado ? 'ok' : 'mal',
  );
  const caja = $('resultado-manos');
  caja.replaceChildren();
  const titulo = document.createElement('p');
  titulo.className = `font-sans text-2xl font-semibold ${aprobado ? 'text-ok' : 'text-mal'}`;
  titulo.textContent = `${nota} de 100 · ${aprobado ? 'Aprobado' : 'Todavía no'}`;
  caja.append(titulo);
  const lista = document.createElement('ul');
  lista.className = 'grid gap-1 text-[15px]';
  if (estado.fallas.size) {
    [...estado.fallas].forEach((id) => {
      const li = document.createElement('li');
      li.textContent = `• ${EJ.reglas.find((r) => r.id === id).frase}`;
      lista.append(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'Postura correcta en todo el intento.';
    lista.append(li);
  }
  caja.append(lista);
  caja.hidden = false;
  $('otra-vez').hidden = false;
  guardar(nota);
}
