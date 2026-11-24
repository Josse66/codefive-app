// Aprende: la lección en tarjetas cortas, una idea a la vez, sobre el autobús 3D.
//   1. Qué vas a aprender
//   2. Una tarjeta por concepto: la cámara viaja a su pieza
//   3. Toca las piezas: hay que tocar cada una (en el autobús o en la tarjeta) para ver cómo falla
//   4. Ordena el procedimiento: los pasos salen revueltos y se tocan en orden
//   5. Seguridad: se confirma con "Entendido"
// Las tarjetas con actividad no dejan avanzar hasta completarla (salvo si la lección ya estaba leída).
import { crearEscena } from '../escena/autobus3d.js';

const raiz = document.getElementById('leccion');
const { tecnicoId, leccionId } = raiz.dataset;
const $ = (id) => document.getElementById(id);
const NIVEL = { 1: 'Nivel básico', 2: 'Nivel medio', 3: 'Nivel avanzado' };
const CLASE_OPCION =
  'flex w-full items-center gap-3 border border-placa-linea bg-white px-4 py-3 text-left text-[16px] transition-colors duration-150 hover:border-tinta';

const el = (etiqueta, clase, texto) => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto != null) nodo.textContent = texto;
  return nodo;
};
const boton = (clase, texto, alClic) => {
  const b = el('button', clase, texto);
  b.type = 'button';
  b.addEventListener('click', alClic);
  return b;
};

let escena = null;
let piezas = [];
let tarjetas = [];
let actual = 0;
let leida = false;
// Estado de las actividades.
const tocadas = new Set();
const ordenHecho = [];
let seguridadVista = false;

// Las actividades piden repintar la tarjeta con un evento (pintarTarjeta se define más abajo).
const repintar = () => raiz.dispatchEvent(new Event('repintar'));

function mostrarError(mensaje) {
  $('mensaje-error').textContent = mensaje;
  $('mensaje-error').hidden = false;
}

// ¿Se puede pasar a la siguiente tarjeta?
function completa(tarjeta) {
  if (leida) return true;
  if (tarjeta.tipo === 'piezas') return piezas.every((p) => tocadas.has(p.id));
  if (tarjeta.tipo === 'orden') return ordenHecho.length === tarjeta.pasos.length;
  if (tarjeta.tipo === 'seguridad') return seguridadVista;
  return true;
}

function fichaPieza(pieza) {
  const ficha = el('dl', 'grid gap-2 border-l-4 border-tinta bg-placa px-4 py-3 text-[15px]');
  [
    ['Qué es', pieza.que],
    ['Cómo falla', pieza.falla],
    ['Cómo se revisa', pieza.revisa],
  ].forEach(([t, d]) => {
    const fila = el('div');
    fila.append(
      el('dt', 'font-narrow text-xs font-bold uppercase tracking-wider text-tinta-3', t),
      el('dd', '', d),
    );
    ficha.append(fila);
  });
  return ficha;
}

function tocarPieza(id) {
  const pieza = piezas.find((p) => p.id === id);
  if (!pieza) return;
  escena.resaltar(id);
  escena.enfocar(id);
  $('ficha-nombre').textContent = pieza.nombre;
  $('ficha-que').textContent = pieza.que;
  $('ficha-falla').textContent = pieza.falla;
  $('ficha-revisa').textContent = pieza.revisa;
  if (tarjetas[actual]?.tipo === 'piezas') {
    tocadas.add(id);
    repintar();
  }
}

function pintarActividadPiezas(caja) {
  caja.append(
    el('h2', 'font-sans text-2xl font-semibold tracking-normal', 'Toca cada pieza en el autobús'),
    el(
      'p',
      'text-tinta-2',
      'Haz clic sobre la pieza en el autobús de la derecha, o tócala aquí. Al tocarla ves qué es, cómo falla y cómo se revisa.',
    ),
  );
  const lista = el('div', 'grid gap-2');
  piezas.forEach((p) => {
    const hecha = tocadas.has(p.id);
    const b = boton(`${CLASE_OPCION} ${hecha ? 'border-ok bg-ok-suave' : ''}`, '', () => tocarPieza(p.id));
    b.append(
      el('span', `recuadro shrink-0 ${hecha ? 'bg-ok' : ''}`, hecha ? '✓' : '·'),
      el('span', 'font-semibold', p.nombre),
    );
    lista.append(b);
  });
  caja.append(lista, el('p', 'text-sm font-semibold', `${tocadas.size} de ${piezas.length} piezas vistas`));
}

function pintarActividadOrden(caja, tarjeta) {
  caja.append(
    el('h2', 'font-sans text-2xl font-semibold tracking-normal', 'Ordena el procedimiento'),
    el('p', 'text-tinta-2', 'Toca los pasos en el orden en que se hacen en el taller.'),
  );
  const hechos = el('ol', 'grid gap-2');
  ordenHecho.forEach((texto, i) => {
    const li = el('li', 'flex items-start gap-3 border border-ok bg-ok-suave px-4 py-3 text-[16px]');
    li.append(el('span', 'recuadro shrink-0 bg-ok', `${i + 1}`), el('span', '', texto));
    hechos.append(li);
  });
  const aviso = el('p', 'min-h-6 text-sm font-semibold text-mal');
  aviso.setAttribute('role', 'status');
  const pendientes = el('div', 'grid gap-2');
  tarjeta.revueltos
    .filter((t) => !ordenHecho.includes(t))
    .forEach((texto) => {
      pendientes.append(
        boton(CLASE_OPCION, texto, (e) => {
          if (texto === tarjeta.pasos[ordenHecho.length]) {
            ordenHecho.push(texto);
            repintar();
          } else {
            aviso.textContent = 'Ese paso va después. Piensa qué se hace primero.';
            e.currentTarget.classList.add('border-mal');
          }
        }),
      );
    });
  caja.append(hechos, pendientes, aviso);
  if (ordenHecho.length === tarjeta.pasos.length) {
    caja.append(el('p', 'font-semibold text-ok', '¡Bien! Ese es el orden correcto.'));
  }
}

function pintarTarjeta() {
  const tarjeta = tarjetas[actual];
  const caja = $('tarjeta');
  caja.replaceChildren();
  caja.classList.toggle('border-mal', tarjeta.tipo === 'seguridad');
  if (tarjeta.tipo === 'objetivo' || tarjeta.tipo === 'concepto') {
    caja.append(
      el('p', 'font-narrow text-sm font-bold uppercase tracking-wider text-tinta-3', tarjeta.etiqueta),
      el('p', 'max-w-[60ch] text-xl leading-relaxed', tarjeta.texto),
    );
    const pieza = piezas.find((p) => p.id === tarjeta.pieza);
    if (pieza) {
      caja.append(el('p', 'text-sm font-semibold', `En el autobús: ${pieza.nombre}`), fichaPieza(pieza));
    }
  } else if (tarjeta.tipo === 'piezas') {
    pintarActividadPiezas(caja);
  } else if (tarjeta.tipo === 'orden') {
    pintarActividadOrden(caja, tarjeta);
  } else if (tarjeta.tipo === 'seguridad') {
    caja.append(
      el('p', 'font-narrow text-sm font-bold uppercase tracking-wider text-mal', 'Seguridad'),
      el('p', 'max-w-[60ch] text-xl font-semibold leading-relaxed', tarjeta.texto),
    );
    if (!seguridadVista) {
      caja.append(
        boton('boton w-fit px-6 py-3', 'Entendido', () => {
          seguridadVista = true;
          pintarTarjeta();
        }),
      );
    } else {
      caja.append(el('p', 'font-semibold text-ok', 'Entendido ✓'));
    }
  }

  const total = tarjetas.length;
  $('tarjeta-cuenta').textContent = `Tarjeta ${actual + 1} de ${total}`;
  $('tarjeta-barra').style.transform = `scaleX(${(actual + 1) / total})`;
  $('tarjeta-anterior').disabled = actual === 0;
  const ultima = actual === total - 1;
  $('tarjeta-siguiente').hidden = ultima;
  $('tarjeta-siguiente').disabled = !completa(tarjeta);
  $('tarjeta-falta').hidden = completa(tarjeta) || ultima;
  $('cierre').hidden = !(ultima && completa(tarjeta));
}

raiz.addEventListener('repintar', () => pintarTarjeta());

function ir(indice) {
  if (indice < 0 || indice >= tarjetas.length) return;
  if (indice > actual && !completa(tarjetas[actual])) return;
  actual = indice;
  const tarjeta = tarjetas[actual];
  // La cámara acompaña a la tarjeta: a su pieza o a la vista general.
  if (tarjeta.pieza) {
    escena.resaltar(tarjeta.pieza);
    escena.enfocar(tarjeta.pieza);
  } else {
    escena.resaltar(null);
    escena.enfocar(null);
  }
  pintarTarjeta();
}

function mostrarSiguientes(datos) {
  // En una misión: solo el botón al siguiente paso.
  if ($('enlace-mision')) {
    $('boton-termine').hidden = true;
    $('enlace-mision').hidden = false;
    return;
  }
  const { competencia, escenario, siguiente } = datos;
  $('enlace-comprobar').href = `/tecnicos/${tecnicoId}/practica/${competencia.id}`;
  if (escenario) {
    $('enlace-taller').href = `/tecnicos/${tecnicoId}/escenario/${escenario.id}`;
    $('enlace-taller-texto').textContent = `Escenario: ${escenario.titulo}.`;
  } else {
    $('enlace-taller').href = `/tecnicos/${tecnicoId}/taller`;
    $('enlace-taller-texto').textContent = 'Atiende las órdenes de tu bahía en el Taller.';
  }
  if (siguiente) {
    $('enlace-siguiente').href = `/tecnicos/${tecnicoId}/aprender/${siguiente.id}`;
    $('siguiente-titulo').textContent = siguiente.titulo;
  } else {
    $('enlace-siguiente').hidden = true;
  }
  $('siguientes').hidden = false;
}

// Mezcla estable: el mismo orden revuelto cada vez que se abre la lección.
function revolver(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = (i * 7 + 3) % (i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.join() === lista.join() ? [...copia.slice(1), copia[0]] : copia;
}

function pintar(datos) {
  const { leccion, grupo, competencia } = datos;
  piezas = leccion.piezas;
  leida = Boolean(datos.vista);
  $('grupo').textContent = grupo.numero;
  $('grupo-nombre').textContent = grupo.nombre;
  $('nivel').textContent = NIVEL[competencia.nivel];
  $('minutos').textContent = `${leccion.minutos} min`;
  $('titulo').textContent = leccion.titulo;
  $('fuente').textContent =
    `Fuente: ${leccion.fuente}. Contenido de capacitación sin información confidencial de Volvo.`;

  tarjetas = [
    { tipo: 'objetivo', etiqueta: 'Qué vas a aprender', texto: leccion.objetivo, pieza: null },
    ...leccion.conceptos.map((texto, i) => ({
      tipo: 'concepto',
      etiqueta: `Idea ${i + 1} de ${leccion.conceptos.length}`,
      texto,
      pieza: piezas[i % piezas.length]?.id ?? null,
    })),
    ...(piezas.length ? [{ tipo: 'piezas', pieza: null }] : []),
    ...(leccion.pasos.length > 1
      ? [{ tipo: 'orden', pasos: leccion.pasos, revueltos: revolver(leccion.pasos), pieza: null }]
      : []),
    { tipo: 'seguridad', texto: leccion.seguridad, pieza: null },
  ];

  escena = crearEscena($('lienzo'), { autobus: datos.autobus, piezas, enfoque: datos.enfoque });
  const posicion = (evento) => {
    const caja = escena.lienzo.getBoundingClientRect();
    return [(evento.clientX - caja.left) / caja.width, (evento.clientY - caja.top) / caja.height];
  };
  escena.lienzo.addEventListener('pointermove', (evento) => {
    const encima = escena.piezaEn(...posicion(evento))?.pieza;
    $('etiqueta-pieza').hidden = !encima;
    if (encima) $('etiqueta-pieza').textContent = encima.nombre;
  });
  escena.lienzo.addEventListener('pointerdown', (evento) => {
    if (evento.button !== 0) return;
    const encima = escena.piezaEn(...posicion(evento))?.pieza;
    if (encima) tocarPieza(encima.id);
  });

  $('tarjeta-anterior').addEventListener('click', () => ir(actual - 1));
  $('tarjeta-siguiente').addEventListener('click', () => ir(actual + 1));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') ir(actual + 1);
    if (e.key === 'ArrowLeft') ir(actual - 1);
  });
  ir(0);

  if (leida) {
    $('boton-termine').textContent = 'Lección leída ✓';
    mostrarSiguientes(datos);
  }
  $('boton-termine').addEventListener('click', async () => {
    try {
      const r = await fetch(`/api/tecnicos/${tecnicoId}/aprender/${leccionId}/vista`, { method: 'POST' });
      if (!r.ok) throw new Error('No se pudo guardar tu avance');
      $('boton-termine').textContent = 'Lección leída ✓';
      mostrarSiguientes(datos);
      $('cierre').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      mostrarError(error.message);
    }
  });
}

fetch(`/api/tecnicos/${tecnicoId}/aprender/${leccionId}`)
  .then(async (r) => {
    const datos = await r.json();
    if (!r.ok) throw new Error(datos.error ?? 'No se pudo cargar la lección');
    pintar(datos);
  })
  .catch((error) => mostrarError(error.message));
