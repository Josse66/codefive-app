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
import DATOS from '../../data/autobus/piezas.json';
import GRUPOS from '../../data/grupos.json';

const raiz = document.getElementById('sim');
const { tecnicoId } = raiz.dataset;
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
const guardar = () => localStorage.setItem(CLAVE, JSON.stringify(progreso));

// ---------- Escena ----------
const escena = crearEscena($('lienzo'), {
  autobus: 'diesel',
  completo: true,
  catalogo,
  enfoque: { objetivo: [0, 1.2, 0], distancia: 9 },
});
// Lo que tapan los paneles (px): la lista de sistemas a la izquierda y la tarjeta a la derecha.
const MARGENES = [300, 412];
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

function barra(actual, total) {
  const fondo = el('div', 'h-1.5 bg-placa-2');
  const relleno = el('div', 'h-1.5 bg-tinta transition-[width] duration-500');
  relleno.style.width = `${Math.round((actual / total) * 100)}%`;
  fondo.append(relleno);
  return fondo;
}

function aviso(tipo, titulo, texto) {
  const clase = {
    ok: 'border-ok bg-ok-suave',
    mal: 'border-mal bg-mal-suave',
    pista: 'border-med bg-med-suave',
  }[tipo];
  const caja = el('div', `grid gap-1 border p-3 text-[15px] ${clase}`);
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
    }[estado.modo](),
  );
  pintarSistemas();
}

function tarjetaLibre() {
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
  const conOrden = SISTEMAS.find((x) => x.orden_taller);
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
    const p = el('p', 'text-[15px]');
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
    el('p', 'text-tinta-2', sistema.resumen),
  ];
  const vueltas = [
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
    else li.append(el('span', 'text-xs text-tinta-3', 'Termina la anterior'));
    lista.append(li);
  });
  partes.push(lista);
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

// ---------- Vuelta 1: Conoce ----------
function empezarConoce(desde = 0) {
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
  partes.push(el('p', 'text-[16px]', f.hazlo.instruccion));
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

function bandeja() {
  const caja = el('div', 'grid grid-cols-2 gap-2');
  HERRAMIENTAS.forEach((h, n) => {
    const b = boton(
      `${n + 1} · ${h.nombre}`,
      'border px-3 py-2 text-left text-sm hover:border-tinta aria-[pressed=true]:border-2 aria-[pressed=true]:border-tinta aria-[pressed=true]:bg-placa-2 aria-[pressed=true]:font-semibold border-placa-linea',
      () => elegir(h.id),
    );
    b.title = h.uso;
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
    estado.retro = aviso('mal', `Esa es: ${ficha(baseTocada).nombre}`, 'Busca la pieza resaltada.');
  } else if (estado.herramienta !== f.hazlo.herramienta) {
    estado.errores += 1;
    const correcta = HERRAMIENTAS.find((h) => h.id === f.hazlo.herramienta);
    estado.retro =
      estado.errores >= 2
        ? aviso('pista', 'Pista', `Usa: ${correcta.nombre}. ${correcta.uso}`)
        : aviso('mal', 'Con esa herramienta no se revisa', f.revisa);
  } else {
    estado.hecho = true;
    estado.retro = aviso('ok', 'Hecho', f.hazlo.resultado);
    // La herramienta empuja hacia la pieza; con agua jabonosa salen burbujas.
    escena.efecto(estado.herramienta === 'jabon' ? 'burbujas' : 'uso', instancias.get(base)?.[0]);
    const p = progresoDe(estado.sistema.id);
    if (!p.conoce.includes(base)) p.conoce.push(base);
    guardar();
  }
  pintar();
}

// ---------- Vuelta 2: Encuéntralo ----------
function empezarEncuentra() {
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
    partes.push(boton('Seguir →', 'boton w-fit px-6', () => abrirSistema(sistema)));
    return partes;
  }
  const base = cola[i];
  const objetivo = el('div', 'grid gap-1 border-2 border-tinta p-4');
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
function empezarComprueba() {
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
  if (i >= cola.length) {
    const calificacion = Math.round((estado.aciertos / estado.total) * 100);
    const p = progresoDe(sistema.id);
    p.comprueba = Math.max(p.comprueba ?? 0, calificacion);
    guardar();
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
    );
    return partes;
  }
  const base = cola[i];
  if (estado.paso === 'senala') {
    const objetivo = el('div', 'grid gap-1 border-2 border-tinta p-4');
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
  if (baseTocada === base) {
    estado.aciertos += 1;
    estado.retro = null;
  } else {
    estado.fallos.push(base);
    estado.retro = aviso(
      'mal',
      `Eso era: ${ficha(baseTocada).nombre}`,
      `${ficha(base).nombre} es otra pieza.`,
    );
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

function empezarOrden() {
  const o = estado.sistema.orden_taller;
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
  });
  irA(estado.sistema);
  pintar();
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
    el('p', 'text-sm text-tinta-2', o.sintoma),
  );
  partes.push(hoja);

  if (estado.fase === 'sintoma') {
    partes.push(
      el(
        'p',
        'text-[15px]',
        'Antes de cambiar nada, encuentra la causa. Revisa las piezas que creas que tienen que ver, cada una con su herramienta: verás su estado real.',
      ),
    );
    partes.push(
      boton('Empezar a revisar →', 'boton w-fit px-6', () => {
        estado.fase = 'inspeccion';
        pintar();
      }),
    );
    return partes;
  }

  if (estado.fase === 'inspeccion') {
    partes.push(
      el('p', 'text-sm font-semibold', `Revisa piezas del motor (${estado.revisadas.size} revisadas)`),
    );
    partes.push(bandeja());
    if (estado.retro) partes.push(estado.retro);
    if (estado.revisadas.size) partes.push(el('p', 'text-sm font-semibold', 'Bitácora'), bitacora());
    partes.push(
      boton('Ya sé la causa →', `${estado.revisadas.size ? 'boton' : 'boton-linea'} w-fit px-6`, () => {
        estado.fase = 'causa';
        estado.retro = null;
        pintar();
      }),
    );
    return partes;
  }

  if (estado.fase === 'causa') {
    partes.push(el('h2', 'font-sans text-xl font-semibold tracking-normal', '¿Qué pieza cambias?'));
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
    partes.push(bandeja());
    if (estado.retro) partes.push(estado.retro);
    return partes;
  }

  // Resultado
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
  );
  return partes;
}

// La cámara va a donde se hace el paso que sigue (la orden enseña el procedimiento, no a buscar).
function irPaso() {
  const base = estado.orden.pasos[estado.i]?.correcta.split('>')[1];
  if (base) irA(estado.sistema, base);
}

function elegirCausa(base) {
  const o = estado.orden;
  const costo = o.costos[base] ?? o.costo_otra;
  if (base !== o.causa) {
    estado.cambiosDeMas.push(base);
    estado.gasto += costo;
    estado.retro = aviso(
      'mal',
      `Cambiaste: ${ficha(base).nombre} (${pesos(costo)})`,
      'Probaste el autobús y sigue perdiendo fuerza. Esa pieza estaba bien: revisa más antes de cambiar.',
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
      estado.retro = aviso('mal', `Con eso no se revisa: ${f.nombre}`, f.revisa);
    } else {
      const { estado: e, hallazgo } = estadoDe(baseTocada);
      if (!estado.revisadas.has(baseTocada)) estado.revisadas.set(baseTocada, hallazgo);
      const id = instancias.get(baseTocada)?.[0];
      escena.efecto(estado.herramienta === 'jabon' ? 'burbujas' : 'uso', id);
      escena.marcarPieza(id, { bien: 'ok', atencion: 'atencion', mal: 'mal' }[e]);
      estado.retro = aviso({ bien: 'ok', atencion: 'pista', mal: 'mal' }[e], f.nombre, hallazgo);
    }
    pintar();
    return;
  }
  if (estado.fase !== 'reparar') return;
  const paso = o.pasos[estado.i];
  const accion = `${estado.herramienta}>${baseTocada}`;
  if (accion === paso.correcta) {
    const id = instancias.get(baseTocada)?.[0];
    if (paso.efecto === 'retirar' || paso.efecto === 'montar') escena.efecto(paso.efecto, id);
    // La pieza nueva ya está bien.
    if (paso.efecto === 'montar') {
      escena.quitarMarcas(id);
      escena.marcarPieza(id, 'ok');
    } else escena.efecto('uso', id);
    estado.i += 1;
    estado.retro = aviso('ok', 'Bien', paso.resultado ?? '');
    if (estado.i >= o.pasos.length) estado.fase = 'resultado';
    else irPaso();
    pintar();
    return;
  }
  const error = paso.errores?.[accion];
  if (error?.critico) {
    estado.criticos += 1;
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
  if (estado.modo === 'encuentra' || estado.modo === 'comprueba') return estado.cola[estado.i];
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

// Solo en desarrollo: para probar el flujo desde la consola.
if (import.meta.env.DEV)
  window.simDepuracion = { escena, estado, datos: DATOS, instancias: () => instancias };
