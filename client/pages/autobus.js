/* eslint-disable no-use-before-define -- las tarjetas se llaman entre sí (flujo de vueltas); son funciones elevadas. */
// El simulador: un autobús diésel completo y aprender sobre él, sistema por sistema.
//
// Cada sistema se aprende en 3 vueltas, con un apoyo que se va quitando:
//   1. Conoce (guiado): para cada pieza, primero adivinas qué es (preguntar antes de explicar),
//      luego lees qué es, cómo falla y cómo se revisa, y al final la revisas tú con la herramienta.
//   2. Encuéntralo (con pistas): te dicen el nombre y tú la señalas en el autobús; si fallas
//      dos veces se resalta.
//   3. Comprueba (solo): señalas y eliges con qué se revisa, sin pistas. Se aprueba con 91.
import { crearEscena } from '../escena/autobus3d.js';
import { InputBus } from '../entradas/inputBus.js';
import { alternarSonido, sonar, sonidoActivo } from '../escena/sonidos.js';
import { hablar } from '../accesibilidad/voz.js';
import DATOS from '../../data/autobus/piezas.json';
import GRUPOS from '../../data/grupos.json';

const raiz = document.getElementById('sim');
const { tecnicoId, experiencia, nombre: nombreTecnico } = raiz.dataset;
// Experiencia Paso a paso: una tarjeta grande a la vez, letra grande, la cámara se mueve sola
// con botones grandes, la voz lee cada instrucción (con el mismo texto en pantalla) y hay
// práctica libre sin calificación antes de Comprueba. El contenido y el 91 son los mismos.
const MAYOR = experiencia === 'mayor';
if (MAYOR) raiz.classList.add('mayor');
const $ = (id) => document.getElementById(id);
const APROBACION = 91;
const MAX_COMPRUEBA = 8;

// ---------- Datos ----------
const SISTEMAS = DATOS.sistemas;
const HERRAMIENTAS = DATOS.herramientas;
const sistemaDePieza = new Map(SISTEMAS.flatMap((s) => s.orden.map((base) => [base, s])));

// "tambor_trasera_izq" → "tambor": se quitan terminaciones hasta dar con la ficha.
function baseDe(id) {
  let actual = id;
  while (actual && !DATOS.piezas[actual]) {
    const corte = actual.lastIndexOf('_');
    actual = corte > 0 ? actual.slice(0, corte) : '';
  }
  return actual || null;
}
const ficha = (base) => DATOS.piezas[base];
const catalogo = (id) => {
  const base = baseDe(id);
  return base ? { ...ficha(base), base } : null;
};

// ---------- Progreso (en este navegador) ----------
const CLAVE = `progreso-autobus-${tecnicoId}`;
const progreso = JSON.parse(localStorage.getItem(CLAVE) ?? '{}');
const progresoDe = (sistemaId) => {
  progreso[sistemaId] ??= { conoce: [], encuentra: false, comprueba: null };
  return progreso[sistemaId];
};
// El avance vive en el servidor (para el panel de Volvo); el navegador guarda una copia por si
// se va la red. guardar() manda el sistema que se está trabajando.
const API = `/api/tecnicos/${tecnicoId}/simulador`;
const enviar = (url, metodo, cuerpo) =>
  fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  }).catch(() => null);
const guardar = () => {
  localStorage.setItem(CLAVE, JSON.stringify(progreso));
  const id = estado?.sistema?.id;
  if (id) enviar(`${API}/progreso/${id}`, 'PUT', { datos: progreso[id] });
};

// Sesión de práctica: cada 30 s, si hubo actividad en el último minuto y la pestaña se ve,
// suma ese tiempo como práctica efectiva (horas del IEFI).
const sesion = { id: null, ultimoMovimiento: Date.now() };
['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach((tipo) =>
  window.addEventListener(tipo, () => {
    sesion.ultimoMovimiento = Date.now();
  }),
);
enviar(`${API}/sesiones`, 'POST', {})
  .then((r) => r?.json())
  .then((d) => {
    sesion.id = d?.sesionId ?? null;
  });
setInterval(() => {
  const activo = document.visibilityState === 'visible' && Date.now() - sesion.ultimoMovimiento < 60000;
  if (sesion.id && activo) enviar(`${API}/sesiones/${sesion.id}/latido`, 'POST', { segundos: 30 });
}, 30000);

// Bitácora de acciones (lista de cotejo, Pareto de errores, precisión y autonomía del ICO).
// Se manda en tandas; al cerrar la página, con sendBeacon.
const colaAcciones = [];
function registrar(
  actividad,
  {
    resultado,
    pieza = null,
    herramienta = estado.herramienta,
    paso = null,
    conAyuda = false,
    detalle = null,
  },
) {
  if (!estado.sistema) return;
  colaAcciones.push({
    sistema: estado.sistema.id,
    actividad,
    intento: estado.intento ?? 1,
    pieza,
    herramienta,
    paso,
    resultado,
    conAyuda,
    detalle,
  });
}
function vaciarCola(alCerrar = false) {
  if (!colaAcciones.length) return;
  const cuerpo = JSON.stringify({ sesionId: sesion.id, acciones: colaAcciones.splice(0) });
  if (alCerrar) navigator.sendBeacon(`${API}/acciones`, new Blob([cuerpo], { type: 'application/json' }));
  else
    fetch(`${API}/acciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo,
    }).catch(() => null);
}
setInterval(() => vaciarCola(), 4000);
// Al abrir, el avance del servidor manda sobre la copia del navegador.
const progresoListo = fetch(API)
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => {
    if (!d) return;
    Object.assign(progreso, d.progreso);
    localStorage.setItem(CLAVE, JSON.stringify(progreso));
    pintar();
  })
  .catch(() => null);
window.addEventListener('pagehide', () => vaciarCola(true));
function evaluar(tipo, calificacion, detalle = null) {
  vaciarCola();
  return enviar(`${API}/evaluaciones`, 'POST', { sistema: estado.sistema.id, tipo, calificacion, detalle })
    .then((r) => r?.json())
    .catch(() => null);
}

// ---------- Escena ----------
const escena = crearEscena($('lienzo'), {
  autobus: 'diesel',
  completo: true,
  catalogo,
  enfoque: { objetivo: [0, 1.2, 0], distancia: 13 },
});
// Lo que tapan los paneles (px): la lista de sistemas a la izquierda y la tarjeta a la derecha.
const MARGENES = MAYOR ? [0, 584] : [300, 412];
escena.fijarMargenes(...MARGENES);
let instancias = new Map(); // base → [ids de nodos]
escena.lienzo.addEventListener('modelo-listo', () => {
  instancias = new Map();
  escena.idsPiezas().forEach((id) => {
    const base = baseDe(id);
    if (!base) return;
    if (!instancias.has(base)) instancias.set(base, []);
    instancias.get(base).push(id);
  });
  pintarSistemas();
});

// ---------- Estado ----------
const estado = {
  sistema: null,
  modo: 'libre', // libre | sistema | conoce | encuentra | comprueba
  i: 0,
  paso: null, // conoce: predice | ficha | hazlo · comprueba: senala | herramienta
  herramienta: null,
  errores: 0,
  cola: [],
  aciertos: 0,
  total: 0,
  fallos: [],
  vista: null, // pieza vista libremente
  hecho: false,
};

// ---------- Utilidades de la interfaz ----------
const el = (etiqueta, clase = '', texto = '') => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto) nodo.textContent = texto;
  return nodo;
};
const boton = (texto, clase, alClic) => {
  const b = el('button', clase, texto);
  b.type = 'button';
  b.addEventListener('click', alClic);
  return b;
};
// Al terminar una vuelta: regresar a Mi camino, donde se ve el punto lleno y lo que sigue.
const alCamino = () => {
  const a = el('a', 'boton-linea w-fit px-6 py-3 no-underline', 'Volver a Mi camino');
  a.href = `/tecnicos/${tecnicoId}/camino`;
  return a;
};
const mezclar = (lista) =>
  lista
    .map((x) => [Math.random(), x])
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x);

function encabezado(sistema, texto) {
  const fila = el('div', 'flex items-center justify-between gap-2');
  const titulo = el(
    'p',
    'flex items-center gap-2 font-narrow text-sm font-bold uppercase tracking-wider text-tinta-3',
  );
  const fg = el('span', 'recuadro h-6 w-6 text-xs', String(sistema.grupo));
  titulo.append(fg, `${sistema.nombre} · ${texto}`);
  fila.append(
    titulo,
    boton('Salir', 'text-sm text-tinta-2 underline', () => abrirSistema(sistema)),
  );
  return fila;
}

// Marca un elemento para que la voz lo lea en la Experiencia Paso a paso.
const paraLeer = (nodo) => {
  const n = nodo;
  n.dataset.leer = '1';
  return n;
};

function barra(actual, total) {
  const fondo = el('div', 'h-1.5 bg-placa-2');
  const relleno = el('div', 'h-1.5 bg-tinta transition-[width] duration-500');
  relleno.style.width = `${Math.round((actual / total) * 100)}%`;
  fondo.append(relleno);
  return fondo;
}

function aviso(tipo, titulo, texto) {
  // Suena una vez, cuando se crea (la tarjeta se vuelve a pintar con el mismo aviso).
  if (tipo === 'ok') sonar('bien');
  if (tipo === 'mal') sonar('mal');
  const clase = {
    ok: 'border-ok bg-ok-suave',
    mal: 'border-mal bg-mal-suave',
    pista: 'border-med bg-med-suave',
  }[tipo];
  const caja = el('div', `grid gap-1 border p-3 text-[15px] ${clase}`);
  caja.dataset.leer = '1';
  caja.append(el('p', 'font-semibold', titulo));
  if (texto) caja.append(el('p', '', texto));
  return caja;
}

// ---------- Vistas del autobús ----------
function marcarVista(id, activo) {
  $(id).setAttribute('aria-pressed', String(activo));
}
function rayosX(encender) {
  escena.verRayosX(encender);
  marcarVista('vista-rayos', encender);
}
let tapaAbierta = false;
function tapa(abrir) {
  tapaAbierta = abrir;
  escena.abrirTapa(abrir);
  marcarVista('vista-tapa', abrir);
}
let caminando = false;
function caminar(encender) {
  caminando = encender;
  escena.activarInmersivo(encender);
  escena.fijarMargenes(...MARGENES);
  marcarVista('vista-dentro', encender);
  marcarVista('vista-fuera', !encender);
  // Caminando, la lista de sistemas se esconde para ver el taller completo.
  $('panel-sistemas').hidden = encender;
  $('ayuda').textContent = encender
    ? 'Clic derecho sostenido: mirar · W A S D: caminar · Shift: agacharte · clic: usar la herramienta'
    : 'Clic derecho y arrastrar: girar · rueda: acercar · clic en una pieza: verla';
}
$('vista-fuera').addEventListener('click', () => caminar(false));
$('vista-dentro').addEventListener('click', () => caminar(true));
$('vista-rayos').addEventListener('click', () => rayosX(!escena.rayosXActivo()));
$('vista-tapa').addEventListener('click', () => tapa(!tapaAbierta));
// Experiencia Paso a paso: botones grandes en lugar de arrastrar con el mouse o usar el teclado.
if (MAYOR) {
  $('controles-mayor').hidden = false;
  $('ctrl-acercar').addEventListener('click', () => escena.acercar(0.7));
  $('ctrl-alejar').addEventListener('click', () => escena.acercar(1.4));
  $('ctrl-girar-izq').addEventListener('click', () => escena.girar(0.5));
  $('ctrl-girar-der').addEventListener('click', () => escena.girar(-0.5));
  $('ctrl-rayos').addEventListener('click', () => rayosX(!escena.rayosXActivo()));
  $('ctrl-motor').addEventListener('click', () => tapa(!tapaAbierta));
}
marcarVista('vista-sonido', sonidoActivo());
$('vista-sonido').addEventListener('click', () => marcarVista('vista-sonido', alternarSonido()));

// Lleva la cámara al sistema (o a una pieza con la vista del sistema) y prepara rayos X y tapa.
function irA(sistema, base = null) {
  if (caminando) caminar(false);
  if (sistema.rayosX && !escena.rayosXActivo()) rayosX(true);
  if (sistema.tapa && !tapaAbierta) tapa(true);
  const id = base ? instancias.get(base)?.[0] : null;
  const posicion = id ? escena.posicionDe(id) : null;
  if (posicion) escena.enfocar({ objetivo: posicion, distancia: 2.6, vista: sistema.zona.vista });
  else escena.enfocar(sistema.zona);
}

// ---------- Lista de sistemas ----------
function estadoSistema(sistema) {
  const p = progresoDe(sistema.id);
  if (p.comprueba >= APROBACION) return { texto: `Aprobado · ${p.comprueba}`, clase: 'text-ok' };
  if (p.encuentra) return { texto: 'Falta comprobar', clase: 'text-med-texto' };
  if (p.conoce.length >= sistema.orden.length) return { texto: 'Falta encontrar', clase: 'text-med-texto' };
  if (p.conoce.length)
    return { texto: `${p.conoce.length} de ${sistema.orden.length} piezas`, clase: 'text-tinta-2' };
  return { texto: `${sistema.orden.length} piezas`, clase: 'text-tinta-3' };
}

function pintarSistemas() {
  $('lista-sistemas').replaceChildren(
    ...SISTEMAS.map((sistema) => {
      const li = el('li');
      const b = boton(
        '',
        'flex w-full items-center gap-3 border-b border-placa-linea px-4 py-3 text-left hover:bg-placa aria-[current=true]:bg-placa-2',
        () => abrirSistema(sistema),
      );
      b.setAttribute('aria-current', String(estado.sistema?.id === sistema.id));
      const { texto, clase } = estadoSistema(sistema);
      const info = el('span', 'grid flex-1 gap-0.5');
      info.append(
        el('span', 'font-semibold leading-tight', sistema.nombre),
        el('span', `text-xs ${clase}`, texto),
      );
      b.append(el('span', 'recuadro h-7 w-7 shrink-0 text-sm', String(sistema.grupo)), info);
      li.append(b);
      return li;
    }),
  );
}

// ---------- Tarjeta ----------
// En Paso a paso la voz lee lo principal de la tarjeta cada vez que cambia: títulos y lo marcado
// con data-leer (instrucciones, avisos, fichas). Siempre es el mismo texto que está en pantalla.
let ultimoLeido = '';
function leerTarjeta(forzar = false) {
  if (!MAYOR) return;
  const texto = [...$('tarjeta').querySelectorAll('h1, h2, [data-leer]')]
    .map((n) => n.innerText.trim())
    .filter(Boolean)
    .join('. ');
  if (forzar || texto !== ultimoLeido) {
    ultimoLeido = texto;
    hablar(texto);
  }
}

function pintar() {
  const t = $('tarjeta');
  t.replaceChildren(
    ...{
      libre: tarjetaLibre,
      sistema: tarjetaSistema,
      conoce: tarjetaConoce,
      encuentra: tarjetaEncuentra,
      comprueba: tarjetaComprueba,
      orden: tarjetaOrden,
      diagnostico: tarjetaDiagnostico,
    }[estado.modo](),
  );
  if (MAYOR) {
    // Botón para volver a oír, siempre en el mismo lugar (arriba de la tarjeta).
    t.prepend(boton('🔊 Repetir lo que dice', 'boton-linea w-full', () => leerTarjeta(true)));
  }
  pintarSistemas();
  leerTarjeta();
}

// Orden del día: la primera orden de taller que aún no se aprueba (o la primera, si ya todas).
function ordenDelDia() {
  const conOrden = SISTEMAS.filter((x) => x.orden_taller);
  return conOrden.find((x) => !(progresoDe(x.id).orden >= APROBACION)) ?? conOrden[0];
}

function tarjetaLibreMayor() {
  const partes = [
    el(
      'h1',
      'font-sans font-semibold leading-tight tracking-normal',
      `Hola, ${nombreTecnico.split(' ')[0]}. ¿Qué quieres aprender hoy?`,
    ),
  ];
  const intro = el('p', '', 'Toca un sistema del autobús. Te llevo paso a paso, a tu ritmo.');
  intro.dataset.leer = '1';
  partes.push(intro);
  const conOrden = ordenDelDia();
  if (conOrden) {
    partes.push(
      boton(`🔧 Orden del día: ${conOrden.orden_taller.titulo}`, 'boton w-full text-left', () => {
        abrirSistema(conOrden);
        empezarOrden();
      }),
    );
  }
  const lista = el('div', 'grid gap-2');
  SISTEMAS.forEach((sistema) => {
    const { texto } = estadoSistema(sistema);
    const b = boton(
      '',
      'flex w-full items-center gap-3 border-2 border-tinta bg-white px-4 py-3 text-left hover:bg-placa',
      () => abrirSistema(sistema),
    );
    const info = el('span', 'grid');
    info.append(el('span', 'font-semibold', sistema.nombre), el('span', 'text-tinta-3', texto));
    b.append(el('span', 'recuadro h-9 w-9 shrink-0', String(sistema.grupo)), info);
    lista.append(b);
  });
  partes.push(lista);
  return partes;
}

function tarjetaLibre() {
  if (MAYOR) return tarjetaLibreMayor();
  const partes = [
    el('p', 'font-narrow text-sm font-bold uppercase tracking-wider text-tinta-3', 'Tu taller'),
    el(
      'h1',
      'font-sans text-2xl font-semibold leading-tight tracking-normal',
      'Aprende el autobús completo, pieza por pieza',
    ),
    el('p', 'text-tinta-2', 'Elige un sistema a la izquierda. Cada uno se aprende en tres vueltas:'),
  ];
  const lista = el('ol', 'grid gap-2 text-[15px]');
  [
    ['1 · Conoce', 'te llevo pieza por pieza: adivinas qué es, te explico y la revisas tú.'],
    ['2 · Encuéntralo', 'te digo el nombre y tú la señalas en el autobús.'],
    ['3 · Comprueba', 'solo, sin pistas. Apruebas con 91, como en Volvo.'],
  ].forEach(([a, b]) => {
    const li = el('li');
    li.append(el('strong', '', `${a}: `), b);
    lista.append(li);
  });
  partes.push(lista);
  // Orden de taller del día: atajo directo a reparar.
  const conOrden = ordenDelDia();
  if (conOrden) {
    const caja = el('div', 'grid gap-2 border-2 border-tinta bg-placa p-3');
    caja.append(
      el(
        'p',
        'font-narrow text-xs font-bold uppercase tracking-wider text-tinta-3',
        'Orden de taller del día',
      ),
      el('p', 'font-semibold', `${conOrden.orden_taller.titulo} · ${conOrden.nombre}`),
      boton('Abrir la orden →', 'boton w-fit px-4 py-2', () => {
        abrirSistema(conOrden);
        empezarOrden();
      }),
    );
    partes.push(caja);
  }
  if (estado.vista) partes.push(fichaPieza(estado.vista, true));
  else
    partes.push(
      el(
        'p',
        'text-sm text-tinta-3',
        'También puedes hacer clic en cualquier pieza para ver qué es. Usa Rayos X para ver lo de adentro.',
      ),
    );
  return partes;
}

function fichaPieza(base, conBoton) {
  const f = ficha(base);
  const caja = el('article', 'grid gap-2 border border-placa-linea p-4');
  caja.append(el('h2', 'font-sans text-xl font-semibold tracking-normal', f.nombre));
  [
    ['Qué es', f.que],
    ['Cómo falla', f.falla],
    ['Cómo se revisa', f.revisa],
  ].forEach(([titulo, texto]) => {
    const p = paraLeer(el('p', 'text-[15px]'));
    p.append(el('strong', '', `${titulo}: `), texto);
    caja.append(p);
  });
  const sistema = sistemaDePieza.get(base);
  if (conBoton && sistema)
    caja.append(
      boton(`Aprender ${sistema.nombre.toLowerCase()} →`, 'boton w-fit px-5 py-2', () =>
        abrirSistema(sistema),
      ),
    );
  return caja;
}

function abrirSistema(sistema) {
  Object.assign(estado, { sistema, modo: 'sistema', vista: null, herramienta: null });
  escena.quitarMarcas();
  escena.elegirHerramienta(null);
  escena.resaltar(null);
  irA(sistema);
  pintar();
}

function textoConoce(p, conocidas) {
  if (conocidas) return 'Repasar';
  return p.conoce.length ? 'Seguir' : 'Empezar';
}

function tarjetaSistema() {
  const { sistema } = estado;
  const p = progresoDe(sistema.id);
  const conocidas = p.conoce.length >= sistema.orden.length;
  const titulo = el('div', 'flex items-baseline gap-3');
  titulo.append(
    el('span', 'recuadro h-9 w-9 shrink-0 text-xl', String(sistema.grupo)),
    el('h1', 'font-sans text-2xl font-semibold leading-tight tracking-normal', sistema.nombre),
  );
  const partes = [
    boton('← Todos los sistemas', 'w-fit text-sm text-tinta-2 underline', () => {
      Object.assign(estado, { sistema: null, modo: 'libre' });
      escena.enfocar(null);
      pintar();
    }),
    titulo,
    el(
      'p',
      'text-xs text-tinta-3',
      GRUPOS[sistema.grupo]?.nombre ? `FG ${sistema.grupo} · ${GRUPOS[sistema.grupo].nombre}` : '',
    ),
    paraLeer(el('p', 'text-tinta-2', sistema.resumen)),
  ];
  const vueltas = [
    {
      nombre: 'Diagnóstico',
      detalle:
        p.diagnostico != null
          ? `Tu punto de partida: ${p.diagnostico}`
          : '8 preguntas: lo que ya sabes te lo saltas',
      hecho: p.diagnostico != null,
      abierta: p.diagnostico == null,
      ir: empezarDiagnostico,
      texto: 'Empezar',
    },
    {
      nombre: '1 · Conoce',
      detalle: `Guiado, ${sistema.orden.length} piezas`,
      hecho: conocidas,
      abierta: true,
      ir: () => empezarConoce(conocidas ? 0 : p.conoce.length),
      texto: textoConoce(p, conocidas),
    },
    {
      nombre: '2 · Encuéntralo',
      detalle: 'Tú las señalas, con pistas',
      hecho: p.encuentra,
      abierta: conocidas,
      ir: empezarEncuentra,
      texto: p.encuentra ? 'Repetir' : 'Empezar',
    },
    {
      nombre: '3 · Comprueba',
      detalle: `Solo, apruebas con ${APROBACION}`,
      hecho: p.comprueba >= APROBACION,
      abierta: p.encuentra,
      ir: empezarComprueba,
      texto: p.comprueba != null ? `Repetir (${p.comprueba})` : 'Empezar',
    },
  ];
  // Paso a paso: antes de Comprueba hay una práctica libre que no cuenta, para quitar la presión.
  if (MAYOR) {
    vueltas.splice(2, 0, {
      nombre: 'Práctica libre',
      detalle: 'Como Comprueba, pero no cuenta y te muestra la respuesta',
      hecho: Boolean(p.libre),
      abierta: p.encuentra,
      ir: () => empezarComprueba(true),
      texto: p.libre ? 'Otra vez' : 'Practicar',
    });
  }
  // La vuelta que toca lleva el botón principal; las demás, uno secundario.
  const siguiente = vueltas.find((v) => v.abierta && !v.hecho);
  const lista = el('ol', 'grid gap-2');
  vueltas.forEach((v) => {
    const li = el(
      'li',
      `flex items-center justify-between gap-3 border p-3 ${v === siguiente ? 'border-2 border-tinta' : 'border-placa-linea'}`,
    );
    const info = el('span', 'grid gap-0.5');
    info.append(
      el('span', 'font-semibold', `${v.hecho ? '✓ ' : ''}${v.nombre}`),
      el('span', 'text-xs text-tinta-3', v.detalle),
    );
    li.append(info);
    if (v.abierta)
      li.append(
        boton(v.texto, v === siguiente ? 'boton px-4 py-2' : 'boton-linea px-3 py-1.5 text-sm', v.ir),
      );
    else if (!v.hecho) li.append(el('span', 'text-xs text-tinta-3', 'Termina la anterior'));
    lista.append(li);
  });
  partes.push(lista);
  // Demostración de la evaluación diferida: el reloj del técnico avanza 30 días y el siguiente
  // Comprueba cuenta como diferida (retención del IEF).
  if (p.comprueba != null) {
    partes.push(
      boton('Demo: simular 30 días y medir retención', 'w-fit text-sm text-tinta-2 underline', async () => {
        await enviar(`/api/tecnicos/${tecnicoId}/simular-dias`, 'POST', { dias: 30 });
        estado.retro = null;
        $('tarjeta').prepend(
          aviso(
            'pista',
            'Pasaron 30 días (simulados)',
            'Haz Comprueba otra vez: así se mide cuánto recuerdas (retención).',
          ),
        );
      }),
    );
  }
  if (sistema.orden_taller) {
    const o = sistema.orden_taller;
    const mejor = p.orden;
    const caja = el('div', `grid gap-2 border-2 p-3 ${conocidas ? 'border-tinta' : 'border-placa-linea'}`);
    caja.append(
      el(
        'p',
        'font-narrow text-xs font-bold uppercase tracking-wider text-tinta-3',
        'Orden de taller · ahora repáralo',
      ),
      el('p', 'font-semibold', o.titulo),
      el(
        'p',
        'text-xs text-tinta-3',
        mejor != null ? `Tu mejor calificación: ${mejor}` : 'Diagnostica, desarma, cambia y prueba.',
      ),
    );
    // Siempre abierta: quien ya sabe puede ir directo a reparar; se recomienda después de Conoce.
    caja.append(
      boton(
        mejor != null ? 'Repetir la orden' : 'Abrir la orden',
        `${conocidas ? 'boton' : 'boton-linea'} w-fit px-4 py-2`,
        empezarOrden,
      ),
    );
    if (!conocidas) caja.append(el('span', 'text-xs text-tinta-3', 'Te conviene hacer Conoce antes.'));
    partes.push(caja);
  }
  if (sistema.practica) {
    const practica = el('div', 'grid gap-2 border border-placa-linea bg-placa p-3');
    practica.append(el('p', 'text-sm font-semibold', 'Práctica de taller'));
    const a = el('a', 'boton-linea w-fit px-4 py-2 text-sm', `${sistema.practica.texto} →`);
    a.href = `/tecnicos/${tecnicoId}/escenario/${sistema.practica.escenario}`;
    practica.append(a);
    partes.push(practica);
  }
  return partes;
}

// ---------- Diagnóstico: qué sabes antes de aprender (evaluación inicial del IEF) ----------
// Cuatro tipos de pregunta sobre el autobús 3D, dos de cada uno: ¿qué es? (señalarla), ¿para qué
// sirve?, ¿qué pasa si falla? y ¿con qué la revisas? No corrige pregunta por pregunta (no es
// examen): al final dice qué ya sabe y se salta lo dominado. En Paso a paso empieza por lo práctico.
const TIPOS_DIAGNOSTICO = MAYOR
  ? ['senala', 'herramienta', 'sirve', 'falla']
  : ['sirve', 'falla', 'senala', 'herramienta'];
const NOMBRE_TIPO = {
  senala: '¿Qué es? (señalarla)',
  sirve: '¿Para qué sirve?',
  falla: '¿Qué pasa si falla?',
  herramienta: '¿Con qué la revisas?',
};
// Con 91 o más se salta Conoce y Encuéntralo (va directo a Comprueba); con 70, solo Conoce.
const SALTA_CONOCE = 70;

function opcionesDiagnostico(sistema, { tipo, base }) {
  if (tipo === 'senala') return [];
  if (tipo === 'herramienta') {
    const correcta = ficha(base).hazlo.herramienta;
    const otras = mezclar(HERRAMIENTAS.filter((h) => h.id !== correcta)).slice(0, 3);
    return mezclar([
      { texto: HERRAMIENTAS.find((h) => h.id === correcta).nombre, bien: true },
      ...otras.map((h) => ({ texto: h.nombre, bien: false })),
    ]);
  }
  const campo = tipo === 'sirve' ? 'que' : 'falla';
  // Distractores: otras piezas del mismo sistema y, si no alcanzan, de los demás.
  const vecinas = mezclar(sistema.orden.filter((b) => b !== base));
  const lejanas = mezclar(Object.keys(DATOS.piezas).filter((b) => b !== base && !sistema.orden.includes(b)));
  const textos = [...vecinas, ...lejanas]
    .map((b) => ficha(b)[campo])
    .filter((t, i, todos) => t && t !== ficha(base)[campo] && todos.indexOf(t) === i)
    .slice(0, 2);
  return mezclar([
    { texto: ficha(base)[campo], bien: true },
    ...textos.map((texto) => ({ texto, bien: false })),
  ]);
}

function empezarDiagnostico() {
  const { sistema } = estado;
  const piezas = mezclar(sistema.orden);
  const cola = [];
  [0, 1].forEach(() =>
    TIPOS_DIAGNOSTICO.forEach((tipo) => cola.push({ tipo, base: piezas[cola.length % piezas.length] })),
  );
  cola.forEach((p) => Object.assign(p, { opciones: opcionesDiagnostico(sistema, p) }));
  escena.quitarMarcas();
  escena.elegirHerramienta(null);
  Object.assign(estado, { modo: 'diagnostico', cola, i: 0, respuestas: [], evaluado: false, retro: null });
  mostrarPreguntaDiagnostico();
}

// Las preguntas de teoría muestran la pieza resaltada en el autobús; la de señalar, no.
function mostrarPreguntaDiagnostico() {
  const p = estado.cola[estado.i];
  if (p && p.tipo !== 'senala') {
    escena.resaltar(instancias.get(p.base)?.[0] ?? null);
    irA(estado.sistema, p.base);
  } else {
    escena.resaltar(null);
    irA(estado.sistema);
  }
  pintar();
}

function responderDiagnostico(bien) {
  const p = estado.cola[estado.i];
  estado.respuestas.push({ tipo: p.tipo, base: p.base, bien });
  estado.i += 1;
  mostrarPreguntaDiagnostico();
}

function cerrarDiagnostico() {
  const { sistema, respuestas } = estado;
  const nota = Math.round((respuestas.filter((r) => r.bien).length / respuestas.length) * 100);
  const p = progresoDe(sistema.id);
  p.diagnostico = nota;
  if (nota >= SALTA_CONOCE && p.conoce.length < sistema.orden.length) p.conoce = [...sistema.orden];
  if (nota >= APROBACION) p.encuentra = true;
  guardar();
  const porTipo = Object.fromEntries(
    TIPOS_DIAGNOSTICO.map((tipo) => {
      const de = respuestas.filter((r) => r.tipo === tipo);
      return [tipo, { bien: de.filter((r) => r.bien).length, total: de.length }];
    }),
  );
  evaluar('inicial', nota, { porTipo, fallos: respuestas.filter((r) => !r.bien).map((r) => r.base) });
  return { nota, porTipo };
}

function tarjetaDiagnostico() {
  const { sistema, cola, i } = estado;
  const partes = [
    encabezado(sistema, 'Diagnóstico'),
    el(
      'p',
      'text-sm text-tinta-2',
      `${Math.min(i + 1, cola.length)} de ${cola.length} · no cuenta para aprobar`,
    ),
    barra(i, cola.length),
  ];
  if (i >= cola.length) {
    if (!estado.evaluado) {
      estado.evaluado = true;
      estado.resultadoDiagnostico = cerrarDiagnostico();
    }
    const { nota, porTipo } = estado.resultadoDiagnostico;
    let salto = 'Empiezas desde Conoce: te enseño pieza por pieza.';
    if (nota >= APROBACION) salto = 'Ya lo dominas: te saltas Conoce y Encuéntralo. Ve directo a Comprueba.';
    else if (nota >= SALTA_CONOCE)
      salto = 'Ya conoces las piezas: te saltas Conoce y empiezas en Encuéntralo.';
    partes.push(aviso(nota >= SALTA_CONOCE ? 'ok' : 'pista', `Tu punto de partida: ${nota} de 100`, salto));
    const lista = el('ul', 'grid gap-1 text-sm');
    TIPOS_DIAGNOSTICO.forEach((tipo) => {
      const { bien, total } = porTipo[tipo];
      lista.append(el('li', 'flex justify-between gap-2', ''));
      lista.lastChild.append(
        el('span', '', NOMBRE_TIPO[tipo]),
        el('span', 'font-semibold', `${bien} de ${total}`),
      );
    });
    partes.push(
      lista,
      boton('Ver mi siguiente paso →', 'boton w-fit px-6', () => abrirSistema(sistema)),
      alCamino(),
    );
    return partes;
  }
  const p = cola[i];
  if (i === 0)
    partes.push(
      paraLeer(
        el(
          'p',
          'text-tinta-2',
          'Antes de aprender, veamos qué ya sabes. Si no lo sabes, toca «No lo sé»: está bien.',
        ),
      ),
    );
  if (p.tipo === 'senala') {
    const objetivo = paraLeer(el('div', 'grid gap-1 border-2 border-tinta p-4'));
    objetivo.append(
      el('p', 'text-sm text-tinta-3', '¿Qué es? Señala en el autobús:'),
      el('p', 'font-sans text-2xl font-semibold', ficha(p.base).nombre),
    );
    partes.push(objetivo);
  } else {
    const pregunta = {
      sirve: `¿Para qué sirve: ${ficha(p.base).nombre.toLowerCase()}?`,
      falla: `¿Qué pasa cuando falla: ${ficha(p.base).nombre.toLowerCase()}?`,
      herramienta: `¿Con qué revisas: ${ficha(p.base).nombre.toLowerCase()}?`,
    }[p.tipo];
    partes.push(
      el('p', 'text-sm text-tinta-3', 'Es la pieza resaltada en el autobús.'),
      el('h2', 'font-sans text-xl font-semibold tracking-normal', pregunta),
    );
    const opciones = el('div', p.tipo === 'herramienta' ? 'grid grid-cols-2 gap-2' : 'grid gap-2');
    p.opciones.forEach((o) =>
      opciones.append(
        boton(o.texto, 'border border-tinta px-3 py-2 text-left text-sm hover:bg-placa', () =>
          responderDiagnostico(o.bien),
        ),
      ),
    );
    partes.push(opciones);
  }
  partes.push(boton('No lo sé', 'boton-linea w-fit px-4 py-2 text-sm', () => responderDiagnostico(false)));
  return partes;
}

// ---------- Vuelta 1: Conoce ----------
function empezarConoce(desde = 0) {
  estado.intento = Date.now();
  Object.assign(estado, {
    modo: 'conoce',
    i: desde,
    paso: 'predice',
    errores: 0,
    hecho: false,
    herramienta: null,
  });
  mostrarPiezaConoce();
}

function mostrarPiezaConoce() {
  const base = estado.sistema.orden[estado.i];
  escena.elegirHerramienta(null);
  estado.herramienta = null;
  const id = instancias.get(base)?.[0];
  escena.resaltar(id ?? null);
  irA(estado.sistema, base);
  pintar();
}

function opcionesNombre(base) {
  const otras = estado.sistema.orden.filter((b) => b !== base);
  const resto = Object.keys(DATOS.piezas).filter((b) => b !== base && !otras.includes(b));
  const distractores = mezclar(otras).slice(0, 2);
  while (distractores.length < 2) distractores.push(mezclar(resto)[0]);
  return mezclar([base, ...distractores]);
}

function tarjetaConoce() {
  const { sistema, i } = estado;
  const base = sistema.orden[i];
  const f = ficha(base);
  const partes = [
    encabezado(sistema, 'Conoce'),
    el('p', 'text-sm text-tinta-2', `Pieza ${i + 1} de ${sistema.orden.length}`),
    barra(i, sistema.orden.length),
  ];

  if (estado.paso === 'predice') {
    partes.push(
      el('h2', 'font-sans text-xl font-semibold tracking-normal', '¿Qué crees que es la pieza resaltada?'),
    );
    partes.push(
      el('p', 'text-sm text-tinta-3', 'Adivina antes de que te expliquemos: así se te queda mejor.'),
    );
    const opciones = el('div', 'grid gap-2');
    estado.opciones ??= opcionesNombre(base);
    estado.opciones.forEach((b) =>
      opciones.append(
        boton(ficha(b).nombre, 'border border-tinta px-4 py-3 text-left font-semibold hover:bg-placa', () => {
          estado.prediccion = b;
          estado.paso = 'ficha';
          pintar();
        }),
      ),
    );
    partes.push(opciones);
    return partes;
  }

  if (estado.paso === 'ficha') {
    const atino = estado.prediccion === base;
    partes.push(
      atino
        ? aviso('ok', '¡Bien! Es correcto.')
        : aviso('pista', `Es el/la ${f.nombre.toLowerCase()}.`, 'No pasa nada: ahora ya lo sabes.'),
    );
    partes.push(fichaPieza(base, false));
    partes.push(
      boton('Ahora revísala tú →', 'boton w-fit px-6', () => {
        estado.paso = 'hazlo';
        estado.opciones = null;
        estado.errores = 0;
        pintar();
      }),
    );
    return partes;
  }

  // Hazlo: elegir la herramienta y usarla sobre la pieza en el autobús.
  partes.push(el('h2', 'font-sans text-xl font-semibold tracking-normal', f.nombre));
  partes.push(paraLeer(el('p', 'text-[16px]', f.hazlo.instruccion)));
  if (!estado.hecho) {
    partes.push(
      el('p', 'text-sm text-tinta-3', 'Elige la herramienta y haz clic en la pieza resaltada del autobús.'),
    );
    partes.push(bandeja());
  }
  if (estado.retro) partes.push(estado.retro);
  if (estado.hecho) {
    const ultimo = i + 1 >= sistema.orden.length;
    partes.push(
      boton(ultimo ? 'Terminar la vuelta →' : 'Siguiente pieza →', 'boton w-fit px-6', () => {
        estado.retro = null;
        estado.hecho = false;
        if (ultimo) {
          abrirSistema(sistema);
          return;
        }
        estado.i += 1;
        estado.paso = 'predice';
        mostrarPiezaConoce();
      }),
    );
  }
  return partes;
}

// sugerida: en lo guiado, la herramienta que toca se marca para que la persona la ubique.
function bandeja(sugerida = null) {
  const caja = el('div', 'grid grid-cols-2 gap-2');
  HERRAMIENTAS.forEach((h, n) => {
    const b = boton(
      `${n + 1} · ${h.nombre}${h.id === sugerida && estado.herramienta !== h.id ? '  ← usa esta' : ''}`,
      'border px-3 py-2 text-left text-sm hover:border-tinta aria-[pressed=true]:border-2 aria-[pressed=true]:border-tinta aria-[pressed=true]:bg-placa-2 aria-[pressed=true]:font-semibold border-placa-linea',
      () => elegir(h.id),
    );
    b.title = h.uso;
    if (h.id === sugerida) b.classList.add('ring-2', 'ring-med');
    b.setAttribute('aria-pressed', String(estado.herramienta === h.id));
    caja.append(b);
  });
  return caja;
}

function elegir(id) {
  estado.herramienta = id;
  escena.elegirHerramienta(id);
  pintar();
}

function revisarConoce(baseTocada) {
  const base = estado.sistema.orden[estado.i];
  const f = ficha(base);
  if (!estado.herramienta) {
    estado.retro = aviso(
      'pista',
      'Primero elige una herramienta',
      'Está en la lista de arriba (o usa las teclas 1 a 6).',
    );
  } else if (baseTocada !== base) {
    registrar('conoce', {
      resultado: 'error',
      pieza: baseTocada,
      detalle: `Señaló ${ficha(baseTocada).nombre} en vez de ${f.nombre}`,
    });
    estado.retro = aviso('mal', `Esa es: ${ficha(baseTocada).nombre}`, 'Busca la pieza resaltada.');
  } else if (estado.herramienta !== f.hazlo.herramienta) {
    estado.errores += 1;
    registrar('conoce', {
      resultado: 'error',
      pieza: base,
      detalle: `Herramienta equivocada en ${f.nombre}`,
    });
    const correcta = HERRAMIENTAS.find((h) => h.id === f.hazlo.herramienta);
    estado.retro =
      estado.errores >= 2
        ? aviso('pista', 'Pista', `Usa: ${correcta.nombre}. ${correcta.uso}`)
        : aviso('mal', 'Con esa herramienta no se revisa', f.revisa);
  } else {
    estado.hecho = true;
    registrar('conoce', { resultado: 'correcta', pieza: base, conAyuda: true });
    estado.retro = aviso('ok', 'Hecho', f.hazlo.resultado);
    // La herramienta empuja hacia la pieza; con agua jabonosa salen burbujas.
    sonar(estado.herramienta);
    escena.efecto(estado.herramienta === 'jabon' ? 'burbujas' : 'uso', instancias.get(base)?.[0]);
    const p = progresoDe(estado.sistema.id);
    if (!p.conoce.includes(base)) p.conoce.push(base);
    guardar();
  }
  pintar();
}

// ---------- Vuelta 2: Encuéntralo ----------
function empezarEncuentra() {
  estado.intento = Date.now();
  escena.elegirHerramienta(null);
  escena.resaltar(null);
  Object.assign(estado, {
    modo: 'encuentra',
    cola: mezclar(estado.sistema.orden),
    i: 0,
    errores: 0,
    aciertos: 0,
    retro: null,
    hecho: false,
  });
  irA(estado.sistema);
  pintar();
}

function tarjetaEncuentra() {
  const { sistema, cola, i } = estado;
  const partes = [
    encabezado(sistema, 'Encuéntralo'),
    el('p', 'text-sm text-tinta-2', `${i} de ${cola.length} encontradas`),
    barra(i, cola.length),
  ];
  if (i >= cola.length) {
    partes.push(aviso('ok', '¡Las encontraste todas!', `${estado.aciertos} de ${cola.length} a la primera.`));
    partes.push(
      boton('Seguir →', 'boton w-fit px-6', () => abrirSistema(sistema)),
      alCamino(),
    );
    return partes;
  }
  const base = cola[i];
  const objetivo = paraLeer(el('div', 'grid gap-1 border-2 border-tinta p-4'));
  objetivo.append(
    el('p', 'text-sm text-tinta-3', 'Señala en el autobús:'),
    el('p', 'font-sans text-2xl font-semibold', ficha(base).nombre),
  );
  partes.push(objetivo);
  partes.push(el('p', 'text-sm text-tinta-2', `Recuerda: ${ficha(base).que}`));
  if (estado.retro) partes.push(estado.retro);
  return partes;
}

function revisarEncuentra(baseTocada) {
  const base = estado.cola[estado.i];
  if (baseTocada === base) {
    registrar('encuentra', {
      resultado: 'correcta',
      pieza: base,
      herramienta: null,
      conAyuda: estado.errores >= 2,
    });
    if (estado.errores === 0) estado.aciertos += 1;
    escena.marcarPieza(instancias.get(base)?.[0]);
    escena.resaltar(null);
    Object.assign(estado, { i: estado.i + 1, errores: 0, retro: aviso('ok', `¡Sí! ${ficha(base).nombre}.`) });
    if (estado.i >= estado.cola.length) {
      progresoDe(estado.sistema.id).encuentra = true;
      guardar();
    }
  } else {
    estado.errores += 1;
    registrar('encuentra', {
      resultado: 'error',
      pieza: baseTocada,
      herramienta: null,
      detalle: `Confundió ${ficha(base).nombre} con ${ficha(baseTocada).nombre}`,
    });
    if (estado.errores >= 2) {
      escena.resaltar(instancias.get(base)?.[0] ?? null);
      irA(estado.sistema, base);
      estado.retro = aviso(
        'pista',
        `Eso es: ${ficha(baseTocada).nombre}`,
        'Mira la pieza resaltada y haz clic en ella.',
      );
    } else {
      estado.retro = aviso('mal', `Eso es: ${ficha(baseTocada).nombre}`, 'Intenta otra vez.');
    }
  }
  pintar();
}

// ---------- Vuelta 3: Comprueba ----------
// libre === true: práctica libre (no se califica ni se guarda como evaluación; muestra la respuesta).
function empezarComprueba(libre = false) {
  estado.intento = Date.now();
  estado.evaluado = false;
  estado.libre = libre === true;
  escena.elegirHerramienta(null);
  escena.resaltar(null);
  const cola = mezclar(estado.sistema.orden).slice(0, MAX_COMPRUEBA);
  Object.assign(estado, {
    modo: 'comprueba',
    cola,
    i: 0,
    paso: 'senala',
    aciertos: 0,
    total: cola.length * 2,
    fallos: [],
    retro: null,
  });
  irA(estado.sistema);
  pintar();
}

function tarjetaComprueba() {
  const { sistema, cola, i } = estado;
  const partes = [
    encabezado(sistema, 'Comprueba'),
    el('p', 'text-sm text-tinta-2', `${Math.min(i + 1, cola.length)} de ${cola.length} · sin pistas`),
    barra(i, cola.length),
  ];
  if (i >= cola.length && estado.libre) {
    const resultado = Math.round((estado.aciertos / estado.total) * 100);
    progresoDe(sistema.id).libre = true;
    guardar();
    partes.push(
      aviso(
        'pista',
        `Práctica terminada: ${resultado} de 100`,
        'Esta no cuenta. Cuando te sientas listo, haz Comprueba.',
      ),
      boton('Ir a Comprueba →', 'boton w-fit px-6', () => empezarComprueba()),
      boton('Practicar otra vez', 'boton-linea w-fit px-6', () => empezarComprueba(true)),
    );
    return partes;
  }
  if (i >= cola.length) {
    const calificacion = Math.round((estado.aciertos / estado.total) * 100);
    const p = progresoDe(sistema.id);
    p.comprueba = Math.max(p.comprueba ?? 0, calificacion);
    guardar();
    // Final o diferida (a los 30 días) la decide el servidor.
    if (!estado.evaluado) {
      estado.evaluado = true;
      evaluar('comprueba', calificacion, { fallos: [...new Set(estado.fallos)] });
    }
    const aprobado = calificacion >= APROBACION;
    partes.push(
      aviso(
        aprobado ? 'ok' : 'mal',
        `${calificacion} de 100 · ${aprobado ? 'Aprobado' : 'Todavía no'}`,
        aprobado
          ? 'Dominas este sistema.'
          : `Se aprueba con ${APROBACION}. Repasa lo que te faltó y vuelve a intentarlo.`,
      ),
    );
    if (estado.fallos.length) {
      const lista = el('ul', 'grid gap-1 text-sm');
      [...new Set(estado.fallos)].forEach((b) =>
        lista.append(el('li', '', `• ${ficha(b).nombre}: ${ficha(b).revisa}`)),
      );
      partes.push(el('p', 'text-sm font-semibold', 'Repasa:'), lista);
    }
    partes.push(
      boton(aprobado ? 'Volver al sistema →' : 'Volver a intentarlo', 'boton w-fit px-6', () =>
        aprobado ? abrirSistema(sistema) : empezarComprueba(),
      ),
      alCamino(),
    );
    return partes;
  }
  const base = cola[i];
  if (estado.paso === 'senala') {
    const objetivo = paraLeer(el('div', 'grid gap-1 border-2 border-tinta p-4'));
    objetivo.append(
      el('p', 'text-sm text-tinta-3', 'Señala en el autobús:'),
      el('p', 'font-sans text-2xl font-semibold', ficha(base).nombre),
    );
    partes.push(objetivo);
  } else {
    partes.push(
      el(
        'h2',
        'font-sans text-xl font-semibold tracking-normal',
        `¿Con qué revisas: ${ficha(base).nombre.toLowerCase()}?`,
      ),
    );
    const opciones = el('div', 'grid grid-cols-2 gap-2');
    HERRAMIENTAS.forEach((h) =>
      opciones.append(
        boton(
          h.nombre,
          'border border-tinta px-3 py-2 text-left text-sm font-semibold hover:bg-placa',
          () => {
            const bien = h.id === ficha(base).hazlo.herramienta;
            if (bien) estado.aciertos += 1;
            else estado.fallos.push(base);
            Object.assign(estado, { i: estado.i + 1, paso: 'senala', retro: null });
            pintar();
          },
        ),
      ),
    );
    partes.push(opciones);
  }
  if (estado.retro) partes.push(estado.retro);
  return partes;
}

function revisarComprueba(baseTocada) {
  if (estado.paso !== 'senala') return;
  const base = estado.cola[estado.i];
  if (estado.libre && baseTocada !== base) {
    // Práctica libre: el error se explica y se muestra la pieza correcta.
    escena.resaltar(instancias.get(base)?.[0] ?? null);
    irA(estado.sistema, base);
  }
  registrar(estado.libre ? 'libre' : 'comprueba', {
    resultado: baseTocada === base ? 'correcta' : 'error',
    pieza: base,
    herramienta: null,
  });
  if (baseTocada === base) {
    estado.aciertos += 1;
    estado.retro = null;
  } else {
    estado.fallos.push(base);
    estado.retro = estado.libre
      ? aviso(
          'pista',
          `Eso es: ${ficha(baseTocada).nombre}`,
          `${ficha(base).nombre} es la que está resaltada. ${ficha(base).que}`,
        )
      : aviso('mal', `Eso era: ${ficha(baseTocada).nombre}`, `${ficha(base).nombre} es otra pieza.`);
  }
  estado.paso = 'herramienta';
  pintar();
}

// ---------- Orden de taller: diagnosticar y reparar (tipo simulador de taller) ----------
// Fases: sintoma → inspeccion (revisas piezas con su herramienta y ves su estado real) →
// causa (eliges qué está mal; cambiar algo sano cuesta) → reparar (pasos en orden, con
// errores críticos de seguridad) → resultado (calificación con 91 para aprobar).
const PENALIZACION = { error: 5, critico: 30, cambioDeMas: 15, inspeccionDeMas: 2 };
const INSPECCIONES_LIBRES = 8;
const pesos = (n) => `$${Number(n).toLocaleString('es-MX')}`;

// guiada: la primera vez se hace "conmigo": se explica cómo se piensa la falla, qué revisar y
// por qué se hace cada paso. Sola: sin resaltados, con pista si se pide; esa es la calificada.
function empezarOrden(guiada = !progresoDe(estado.sistema.id).ordenGuiada) {
  const o = estado.sistema.orden_taller;
  estado.intento = Date.now();
  escena.reiniciarPiezas();
  escena.quitarMarcas();
  escena.resaltar(null);
  escena.elegirHerramienta(null);
  Object.assign(estado, {
    modo: 'orden',
    fase: 'sintoma',
    herramienta: null,
    revisadas: new Map(),
    i: 0,
    errores: 0,
    criticos: 0,
    cambiosDeMas: [],
    gasto: 0,
    retro: null,
    inicio: Date.now(),
    orden: o,
    guardado: false,
    guiada,
    g: 0,
    siguienteListo: false,
    pista: false,
  });
  irA(estado.sistema);
  pintar();
}

// Lleva la guía a la pieza que toca revisar: la resalta y mueve la cámara ahí.
function mostrarGuia() {
  const paso = estado.orden.guia[estado.g];
  if (!paso) {
    escena.resaltar(null);
    return;
  }
  escena.resaltar(instancias.get(paso.pieza)?.[0] ?? null);
  irA(estado.sistema, paso.pieza);
}

function nombreHerramienta(id) {
  return HERRAMIENTAS.find((h) => h.id === id)?.nombre ?? id;
}

function cajaMaestro(titulo, texto) {
  const caja = paraLeer(el('div', 'grid gap-1 border-l-4 border-med bg-med-suave p-3 text-[15px]'));
  caja.append(el('p', 'font-semibold', titulo), el('p', '', texto));
  return caja;
}

function estadoDe(base) {
  const o = estado.orden;
  return o.estados[base] ?? { estado: 'bien', hallazgo: ficha(base).hazlo.resultado };
}

function bitacora() {
  const lista = el('ul', 'grid gap-1 text-sm');
  estado.revisadas.forEach((hallazgo, base) => {
    const { estado: e } = estadoDe(base);
    const marca = { bien: '✓', atencion: '!', mal: '✗' }[e];
    const color = { bien: 'text-ok', atencion: 'text-med-texto', mal: 'text-mal' }[e];
    const li = el('li', 'grid grid-cols-[1.2rem_1fr] gap-1');
    li.append(el('span', `font-bold ${color}`, marca), el('span', '', `${ficha(base).nombre}: ${hallazgo}`));
    lista.append(li);
  });
  return lista;
}

function tarjetaOrden() {
  const { sistema, orden: o } = estado;
  const partes = [encabezado(sistema, 'Orden de taller')];
  const hoja = el('div', 'grid gap-1 border-2 border-tinta bg-placa p-3');
  hoja.append(
    el('p', 'text-xs text-tinta-3', o.cliente),
    el('p', 'font-sans text-lg font-semibold leading-snug', o.titulo),
    paraLeer(el('p', 'text-sm text-tinta-2', o.sintoma)),
  );
  partes.push(hoja);

  if (estado.fase === 'sintoma') {
    const yaGuiada = progresoDe(sistema.id).ordenGuiada;
    partes.push(
      el(
        'p',
        'text-[15px]',
        'Un buen técnico no cambia piezas a ciegas: primero encuentra la causa revisando, y luego repara en orden y con seguridad.',
      ),
    );
    const empezar = (guiada) => () => {
      Object.assign(estado, { guiada, fase: 'inspeccion', g: 0, retro: null });
      if (guiada) mostrarGuia();
      pintar();
    };
    partes.push(
      boton(
        'Hazla conmigo (te enseño paso a paso) →',
        `${yaGuiada ? 'boton-linea' : 'boton'} w-fit px-5 py-2`,
        empezar(true),
      ),
      boton(
        'Hazla solo (calificada, con 91) →',
        `${yaGuiada ? 'boton' : 'boton-linea'} w-fit px-5 py-2`,
        empezar(false),
      ),
    );
    if (!yaGuiada)
      partes.push(el('p', 'text-xs text-tinta-3', 'La primera vez te conviene hacerla conmigo.'));
    return partes;
  }

  if (estado.fase === 'inspeccion') {
    const aCausa = boton('Ya sé la causa →', 'boton w-fit px-6', () => {
      Object.assign(estado, { fase: 'causa', retro: null });
      escena.resaltar(null);
      pintar();
    });
    if (estado.guiada) {
      const guia = o.guia[estado.g];
      partes.push(
        el(
          'p',
          'text-sm text-tinta-2',
          `Diagnóstico guiado · ${Math.min(estado.g + 1, o.guia.length)} de ${o.guia.length}`,
        ),
      );
      if (estado.g === 0 && !estado.siguienteListo)
        partes.push(cajaMaestro('Cómo se piensa', o.razonamiento));
      if (guia && !estado.siguienteListo) {
        partes.push(cajaMaestro('Ahora', guia.texto));
        partes.push(
          el(
            'p',
            'text-sm text-tinta-3',
            `Elige ${nombreHerramienta(guia.herramienta)} y haz clic en la pieza resaltada.`,
          ),
        );
        partes.push(bandeja(guia.herramienta));
      }
      if (estado.retro) partes.push(estado.retro);
      if (estado.siguienteListo) {
        partes.push(cajaMaestro('Qué significa', guia.despues));
        const ultimo = estado.g + 1 >= o.guia.length;
        partes.push(
          ultimo
            ? aCausa
            : boton('Siguiente →', 'boton w-fit px-6', () => {
                Object.assign(estado, { g: estado.g + 1, siguienteListo: false, retro: null });
                mostrarGuia();
                pintar();
              }),
        );
      }
      if (estado.revisadas.size) partes.push(el('p', 'text-sm font-semibold', 'Bitácora'), bitacora());
      return partes;
    }
    partes.push(el('p', 'text-sm font-semibold', `Revisa las piezas (${estado.revisadas.size} revisadas)`));
    partes.push(bandeja());
    if (estado.retro) partes.push(estado.retro);
    if (estado.pista) {
      const falta = o.guia.find((g) => !estado.revisadas.has(g.pieza));
      partes.push(
        cajaMaestro(
          'Pista',
          `${o.razonamiento}${falta ? ` Te falta revisar: ${ficha(falta.pieza).nombre} (con ${nombreHerramienta(falta.herramienta).toLowerCase()}).` : ''}`,
        ),
      );
    } else {
      partes.push(
        boton('Ver pista', 'boton-linea w-fit px-4 py-1.5 text-sm', () => {
          estado.pista = true;
          registrar('orden', {
            resultado: 'ayuda',
            paso: 'inspeccion',
            detalle: 'Pidió pista al diagnosticar',
          });
          pintar();
        }),
      );
    }
    if (estado.revisadas.size) partes.push(el('p', 'text-sm font-semibold', 'Bitácora'), bitacora());
    if (estado.revisadas.size) partes.push(aCausa);
    return partes;
  }

  if (estado.fase === 'causa') {
    partes.push(el('h2', 'font-sans text-xl font-semibold tracking-normal', '¿Qué pieza cambias?'));
    if (estado.guiada) partes.push(cajaMaestro('Pista', o.pista_causa));
    partes.push(
      el('p', 'text-sm text-tinta-3', 'Cambiar una pieza sana cuesta dinero al cliente y no arregla nada.'),
    );
    if (estado.retro) partes.push(estado.retro);
    const opciones = el('div', 'grid grid-cols-2 gap-2');
    sistema.orden
      .filter((b) => !estado.cambiosDeMas.includes(b))
      .forEach((b) =>
        opciones.append(
          boton(
            ficha(b).nombre,
            'border border-tinta px-3 py-2 text-left text-sm font-semibold hover:bg-placa',
            () => elegirCausa(b),
          ),
        ),
      );
    partes.push(opciones);
    partes.push(
      boton('← Seguir revisando', 'w-fit text-sm text-tinta-2 underline', () => {
        estado.fase = 'inspeccion';
        estado.retro = null;
        pintar();
      }),
    );
    return partes;
  }

  if (estado.fase === 'reparar') {
    const paso = o.pasos[estado.i];
    partes.push(
      el('p', 'text-sm text-tinta-2', `Reparación · paso ${estado.i + 1} de ${o.pasos.length}`),
      barra(estado.i, o.pasos.length),
    );
    partes.push(el('h2', 'font-sans text-lg font-semibold leading-snug tracking-normal', paso.texto));
    const [herramienta, pieza] = paso.correcta.split('>');
    const ayuda = estado.guiada || estado.pista;
    if (estado.guiada) partes.push(cajaMaestro('Por qué', paso.porque));
    if (ayuda)
      partes.push(
        el(
          'p',
          'text-sm text-tinta-3',
          `Usa ${nombreHerramienta(herramienta).toLowerCase()} en: ${ficha(pieza).nombre}.`,
        ),
      );
    partes.push(bandeja(ayuda ? herramienta : null));
    if (estado.retro) partes.push(estado.retro);
    if (!ayuda)
      partes.push(
        boton('Ver pista', 'boton-linea w-fit px-4 py-1.5 text-sm', () => {
          estado.pista = true;
          registrar('orden', {
            resultado: 'ayuda',
            paso: `paso ${estado.i + 1}`,
            detalle: 'Pidió pista al reparar',
          });
          escena.resaltar(instancias.get(pieza)?.[0] ?? null);
          pintar();
        }),
      );
    return partes;
  }

  // Resultado
  if (estado.guiada) {
    if (!estado.guardado) {
      progresoDe(sistema.id).ordenGuiada = true;
      guardar();
      estado.guardado = true;
    }
    partes.push(aviso('ok', 'Práctica guiada completa', o.pasos.at(-1).resultado));
    partes.push(
      el(
        'p',
        'text-[15px]',
        'Ya viste cómo se diagnostica y se repara. Ahora hazla tú solo: esa es la que se califica con 91.',
      ),
      boton('Ahora hazla solo →', 'boton w-fit px-6', () => empezarOrden(false)),
    );
    return partes;
  }
  const minutos = Math.max(1, Math.round((Date.now() - estado.inicio) / 60000));
  const inspeccionesDeMas = Math.max(0, estado.revisadas.size - INSPECCIONES_LIBRES);
  const calificacion = Math.max(
    0,
    100 -
      estado.errores * PENALIZACION.error -
      estado.criticos * PENALIZACION.critico -
      estado.cambiosDeMas.length * PENALIZACION.cambioDeMas -
      inspeccionesDeMas * PENALIZACION.inspeccionDeMas,
  );
  if (!estado.guardado) {
    const p = progresoDe(sistema.id);
    p.orden = Math.max(p.orden ?? 0, calificacion);
    guardar();
    estado.guardado = true;
    evaluar('orden', calificacion, {
      errores: estado.errores,
      criticos: estado.criticos,
      cambiosDeMas: estado.cambiosDeMas,
    });
  }
  const aprobado = calificacion >= APROBACION;
  partes.push(
    aviso(
      aprobado ? 'ok' : 'mal',
      `${calificacion} de 100 · ${aprobado ? 'Orden aprobada' : 'Todavía no'}`,
      o.pasos.at(-1).resultado,
    ),
  );
  const tabla = el('ul', 'grid gap-1 text-sm');
  [
    ['Tiempo', `${minutos} min`],
    ['Piezas revisadas', String(estado.revisadas.size)],
    ['Errores de procedimiento', String(estado.errores)],
    ['Errores críticos de seguridad', String(estado.criticos)],
    [
      'Refacciones cambiadas de más',
      estado.cambiosDeMas.length ? estado.cambiosDeMas.map((b) => ficha(b).nombre).join(', ') : 'Ninguna',
    ],
    ['Gasto en refacciones', pesos(estado.gasto)],
  ].forEach(([a, b]) => {
    const li = el('li', 'flex justify-between gap-3 border-b border-placa-linea py-1');
    li.append(el('span', 'text-tinta-2', a), el('strong', '', b));
    tabla.append(li);
  });
  partes.push(tabla);
  partes.push(
    boton(aprobado ? 'Volver al sistema →' : 'Repetir la orden', 'boton w-fit px-6', () =>
      aprobado ? abrirSistema(sistema) : empezarOrden(),
    ),
    alCamino(),
  );
  return partes;
}

// La cámara va a donde se hace el paso que sigue (la orden enseña el procedimiento, no a buscar).
function irPaso() {
  const base = estado.orden.pasos[estado.i]?.correcta.split('>')[1];
  if (!base) return;
  irA(estado.sistema, base);
  if (estado.guiada) escena.resaltar(instancias.get(base)?.[0] ?? null);
}

function elegirCausa(base) {
  const o = estado.orden;
  const costo = o.costos[base] ?? o.costo_otra;
  if (base !== o.causa) {
    registrar('orden', {
      resultado: 'error',
      pieza: base,
      herramienta: null,
      paso: 'causa',
      conAyuda: estado.guiada,
      detalle: `Cambió ${ficha(base).nombre} sin necesidad`,
    });
    estado.cambiosDeMas.push(base);
    estado.gasto += costo;
    estado.retro = aviso(
      'mal',
      `Cambiaste: ${ficha(base).nombre} (${pesos(costo)})`,
      `${o.sigue ?? 'La falla sigue.'} Esa pieza estaba bien: revisa más antes de cambiar.`,
    );
    pintar();
    return;
  }
  estado.gasto += costo;
  Object.assign(estado, {
    fase: 'reparar',
    i: 0,
    retro: aviso('ok', `Diagnóstico correcto: ${ficha(base).nombre}`, 'Ahora repáralo en orden.'),
  });
  irPaso();
  pintar();
}

function revisarOrden(baseTocada) {
  const o = estado.orden;
  if (!estado.herramienta) {
    estado.retro = aviso(
      'pista',
      'Primero elige una herramienta',
      'Está en la lista (o usa las teclas 1 a 6).',
    );
    pintar();
    return;
  }
  if (estado.fase === 'inspeccion') {
    const f = ficha(baseTocada);
    if (estado.herramienta !== f.hazlo.herramienta) {
      registrar('orden', {
        resultado: 'error',
        pieza: baseTocada,
        paso: 'inspeccion',
        conAyuda: estado.guiada,
        detalle: `Revisó ${f.nombre} con la herramienta equivocada`,
      });
      estado.retro = aviso('mal', `Con eso no se revisa: ${f.nombre}`, f.revisa);
    } else {
      registrar('orden', {
        resultado: 'correcta',
        pieza: baseTocada,
        paso: 'inspeccion',
        conAyuda: estado.guiada,
      });
      const { estado: e, hallazgo } = estadoDe(baseTocada);
      if (!estado.revisadas.has(baseTocada)) estado.revisadas.set(baseTocada, hallazgo);
      const id = instancias.get(baseTocada)?.[0];
      sonar(estado.herramienta);
      escena.efecto(estado.herramienta === 'jabon' ? 'burbujas' : 'uso', id);
      escena.marcarPieza(id, { bien: 'ok', atencion: 'atencion', mal: 'mal' }[e]);
      estado.retro = aviso({ bien: 'ok', atencion: 'pista', mal: 'mal' }[e], f.nombre, hallazgo);
      if (estado.guiada && o.guia[estado.g]?.pieza === baseTocada) {
        estado.siguienteListo = true;
        escena.resaltar(null);
      }
    }
    pintar();
    return;
  }
  if (estado.fase !== 'reparar') return;
  const paso = o.pasos[estado.i];
  const accion = `${estado.herramienta}>${baseTocada}`;
  if (accion === paso.correcta) {
    registrar('orden', {
      resultado: 'correcta',
      pieza: baseTocada,
      paso: `paso ${estado.i + 1}`,
      conAyuda: estado.guiada || estado.pista,
    });
    const id = instancias.get(baseTocada)?.[0];
    sonar(paso.sonido ?? paso.efecto ?? estado.herramienta);
    if (paso.efecto === 'retirar' || paso.efecto === 'montar') escena.efecto(paso.efecto, id);
    // La pieza nueva ya está bien.
    if (paso.efecto === 'montar') {
      escena.quitarMarcas(id);
      escena.marcarPieza(id, 'ok');
    } else escena.efecto('uso', id);
    estado.i += 1;
    estado.pista = false;
    // Sola: el porqué se enseña después de acertar.
    estado.retro = aviso('ok', 'Bien', paso.resultado ?? (estado.guiada ? '' : paso.porque));
    escena.resaltar(null);
    if (estado.i >= o.pasos.length) estado.fase = 'resultado';
    else irPaso();
    pintar();
    return;
  }
  const error = paso.errores?.[accion];
  registrar('orden', {
    resultado: error?.critico ? 'critico' : 'error',
    pieza: baseTocada,
    paso: `paso ${estado.i + 1}`,
    conAyuda: estado.guiada || estado.pista,
    detalle: error?.mensaje ?? `Fuera de orden en el paso ${estado.i + 1}: ${accion}`,
  });
  if (error?.critico) {
    estado.criticos += 1;
    sonar('critico');
    escena.efecto('golpe');
    estado.retro = aviso('mal', 'Error crítico de seguridad: se detiene el trabajo', error.mensaje);
  } else {
    estado.errores += 1;
    estado.retro = aviso(
      'mal',
      'Ese no es el paso',
      error?.mensaje ?? `Haz lo que pide la orden: ${paso.texto}`,
    );
  }
  pintar();
}

// ---------- Entradas: mouse hoy; cámara y guante se conectan al mismo bus ----------
const entradas = new InputBus();
entradas.conectarMouse(escena.lienzo);
const explorando = () => estado.modo === 'libre' || estado.modo === 'sistema';

// Qué hay bajo el cursor se calcula a lo más una vez por cuadro, y nunca mientras se gira la
// vista con el clic derecho (el rayo contra la carrocería es lo más caro de cada movimiento).
let girando = false;
escena.lienzo.addEventListener('pointerdown', (e) => {
  if (e.button === 2) girando = true;
});
window.addEventListener('pointerup', (e) => {
  if (e.button === 2) girando = false;
});
let poseUltima = null;
let posePendiente = false;
entradas.addEventListener('pose', ({ detail }) => {
  poseUltima = detail;
  if (posePendiente || girando) return;
  posePendiente = true;
  requestAnimationFrame(() => {
    posePendiente = false;
    if (!girando) atenderPose(poseUltima);
  });
});

function atenderPose(detail) {
  const encima = escena.moverHerramienta(detail.x, detail.y, entradas.fuentes.guante ? detail : null)?.pieza;
  // Explorando, el cursor resalta y nombra; en las vueltas no se regala el nombre.
  if (explorando()) {
    escena.resaltar(encima?.id ?? null);
    $('etiqueta-pieza').hidden = !encima;
    if (encima) $('etiqueta-pieza').textContent = encima.nombre;
  } else {
    $('etiqueta-pieza').hidden = true;
  }
}

// La pieza que se busca ahora (si hay una), para aceptar el clic aunque otra quede enfrente.
function buscada() {
  if (estado.modo === 'conoce') return estado.sistema.orden[estado.i];
  if (estado.modo === 'orden' && estado.fase === 'reparar')
    return estado.orden.pasos[estado.i]?.correcta.split('>')[1];
  if (estado.modo === 'orden' && estado.fase === 'inspeccion' && estado.guiada)
    return estado.orden.guia[estado.g]?.pieza ?? null;
  if (estado.modo === 'encuentra' || estado.modo === 'comprueba') return estado.cola[estado.i];
  if (estado.modo === 'diagnostico') return estado.cola[estado.i]?.base ?? null;
  return null;
}

entradas.addEventListener('grab', ({ detail }) => {
  const enLinea = escena.piezasEn(detail.x, detail.y).map(baseDe);
  if (!enLinea.length) return;
  const objetivo = buscada();
  const base = objetivo && enLinea.includes(objetivo) ? objetivo : enLinea[0];
  if (estado.modo === 'conoce' && estado.paso === 'hazlo' && !estado.hecho) revisarConoce(base);
  else if (estado.modo === 'encuentra' && estado.i < estado.cola.length) revisarEncuentra(base);
  else if (estado.modo === 'comprueba' && estado.i < estado.cola.length) revisarComprueba(base);
  else if (estado.modo === 'diagnostico' && estado.cola[estado.i]?.tipo === 'senala')
    responderDiagnostico(base === estado.cola[estado.i].base);
  else if (estado.modo === 'orden' && (estado.fase === 'inspeccion' || estado.fase === 'reparar'))
    revisarOrden(base);
  else if (explorando()) {
    estado.vista = base;
    if (estado.modo === 'sistema') estado.modo = 'libre';
    pintar();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && caminando) {
    e.preventDefault();
    return;
  }
  const conBandeja = (estado.modo === 'conoce' && estado.paso === 'hazlo') || estado.modo === 'orden';
  if (conBandeja && /^Digit[1-6]$/.test(e.code)) {
    elegir(HERRAMIENTAS[Number(e.code.slice(5)) - 1].id);
  }
});

pintar();

// Desde Mi camino: ?sistema=motor&vuelta=conoce abre ese sistema directo en esa vuelta, cuando el
// modelo y el avance del servidor ya llegaron (o a los 8 s, para no dejar al técnico esperando).
const params = new URLSearchParams(window.location.search);
const sistemaUrl = SISTEMAS.find((s) => s.id === params.get('sistema'));
if (sistemaUrl) {
  const modeloListo = new Promise((listo) => {
    escena.lienzo.addEventListener('modelo-listo', listo, { once: true });
  });
  const espera = new Promise((listo) => {
    setTimeout(listo, 8000);
  });
  Promise.race([Promise.all([modeloListo, progresoListo]), espera]).then(() => {
    abrirSistema(sistemaUrl);
    const p = progresoDe(sistemaUrl.id);
    const vueltas = {
      diagnostico: empezarDiagnostico,
      conoce: () => empezarConoce(p.conoce.length < sistemaUrl.orden.length ? p.conoce.length : 0),
      encuentra: empezarEncuentra,
      libre: () => empezarComprueba(true),
      comprueba: () => empezarComprueba(),
      orden: () => sistemaUrl.orden_taller && empezarOrden(),
    };
    vueltas[params.get('vuelta')]?.();
  });
}

// Solo en desarrollo: para probar el flujo desde la consola.
if (import.meta.env.DEV)
  window.simDepuracion = { escena, estado, datos: DATOS, instancias: () => instancias };
