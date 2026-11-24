// Lección del Modo Aprender: texto a la izquierda y el autobús 3D a la derecha. Cada pieza de la
// lección se puede elegir en la lista o con un clic en el autobús, y su ficha explica qué es, cómo
// falla y cómo se revisa. Al terminar, la lección lleva a comprobar y a practicar en el Taller.
import { crearEscena } from '../escena/autobus3d.js';

const raiz = document.getElementById('leccion');
const { tecnicoId, leccionId } = raiz.dataset;
const $ = (id) => document.getElementById(id);
const NIVEL = { 1: 'Nivel básico', 2: 'Nivel medio', 3: 'Nivel avanzado' };
const CLASE_PIEZA =
  'border border-placa-linea bg-white px-3 py-2 text-[15px] font-semibold transition-colors duration-150 hover:border-tinta aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-white';

const el = (etiqueta, clase, texto) => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto != null) nodo.textContent = texto;
  return nodo;
};

let escena = null;
let piezas = [];

function elegirPieza(id) {
  const pieza = piezas.find((p) => p.id === id);
  if (!pieza) return;
  escena.resaltar(id);
  $('ficha-nombre').textContent = pieza.nombre;
  $('ficha-que').textContent = pieza.que;
  $('ficha-falla').textContent = pieza.falla;
  $('ficha-revisa').textContent = pieza.revisa;
  $('lista-piezas')
    .querySelectorAll('button')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
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

function pintar(datos) {
  const { leccion, grupo, competencia } = datos;
  piezas = leccion.piezas;
  $('grupo').textContent = grupo.numero;
  $('grupo-nombre').textContent = grupo.nombre;
  $('nivel').textContent = NIVEL[competencia.nivel];
  $('minutos').textContent = `${leccion.minutos} min`;
  $('titulo').textContent = leccion.titulo;
  $('objetivo').textContent = leccion.objetivo;
  $('conceptos').replaceChildren(...leccion.conceptos.map((t) => el('p', '', t)));
  $('pasos').replaceChildren(
    ...leccion.pasos.map((t, i) => {
      const li = el('li', 'flex items-start gap-3 text-[17px] leading-relaxed');
      li.append(el('span', 'recuadro mt-0.5', `${i + 1}`), el('span', '', t));
      return li;
    }),
  );
  $('seguridad').textContent = `Seguridad: ${leccion.seguridad}`;
  $('fuente').textContent =
    `Fuente: ${leccion.fuente}. Contenido de capacitación sin información confidencial de Volvo.`;
  $('lista-piezas').replaceChildren(
    ...piezas.map((p) => {
      const boton = el('button', CLASE_PIEZA, p.nombre);
      boton.type = 'button';
      boton.dataset.id = p.id;
      boton.setAttribute('aria-pressed', 'false');
      boton.addEventListener('click', () => elegirPieza(p.id));
      return boton;
    }),
  );

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
    if (encima) elegirPieza(encima.id);
  });
  elegirPieza(piezas[0]?.id);

  if (datos.vista) {
    $('boton-termine').textContent = 'Lección leída ✓';
    mostrarSiguientes(datos);
  }
  $('boton-termine').addEventListener('click', async () => {
    try {
      const r = await fetch(`/api/tecnicos/${tecnicoId}/aprender/${leccionId}/vista`, { method: 'POST' });
      if (!r.ok) throw new Error('No se pudo guardar tu avance');
      $('boton-termine').textContent = 'Lección leída ✓';
      mostrarSiguientes(datos);
      $('siguientes').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      $('mensaje-error').textContent = error.message;
      $('mensaje-error').hidden = false;
    }
  });
}

fetch(`/api/tecnicos/${tecnicoId}/aprender/${leccionId}`)
  .then(async (r) => {
    const datos = await r.json();
    if (!r.ok) throw new Error(datos.error ?? 'No se pudo cargar la lección');
    pintar(datos);
  })
  .catch((error) => {
    $('mensaje-error').textContent = error.message;
    $('mensaje-error').hidden = false;
  });
