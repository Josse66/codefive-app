// Inicio del Modo Taller: nivel y experiencia del técnico, bahía con las órdenes de trabajo
// que eligió el motor adaptativo, historial de órdenes entregadas y lo que falta desbloquear.
const raiz = document.getElementById('taller');
const { tecnicoId } = raiz.dataset;
const $ = (id) => document.getElementById(id);

const MOTIVO = {
  seguridad: { texto: 'Prioridad: seguridad', clase: 'border-mal bg-mal text-white' },
  brecha: { texto: 'Refuerza una brecha', clase: 'border-med bg-med-suave text-med-texto' },
  nueva: { texto: 'Trabajo nuevo', clase: 'border-tinta bg-white text-tinta' },
  repaso: { texto: 'Repaso', clase: 'border-ok bg-ok-suave text-ok' },
};
const NIVEL_VOLVO = { 1: 'Básico', 2: 'Medio', 3: 'Avanzado' };

const el = (etiqueta, clase, texto) => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto != null) nodo.textContent = texto;
  return nodo;
};
const estrellas = (n) => '★'.repeat(n ?? 0) + '☆'.repeat(3 - (n ?? 0));
const minutos = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

function tarjeta(orden) {
  const li = el('li', 'grid content-start gap-3 border border-tinta bg-white p-5');
  if (orden.escenario.grupo === 3 && orden.escenario.autobus === 'electrico') li.classList.add('border-hv');

  const arriba = el('div', 'flex items-start justify-between gap-3');
  const folio = el('div', 'grid');
  folio.append(el('span', 'codigo text-2xl', orden.folio), el('span', 'text-xs text-tinta-3', orden.cliente));
  const grupo = el('span', 'recuadro h-9 w-9 text-xl', `${orden.escenario.grupo}`);
  arriba.append(folio, grupo);

  const motivo = MOTIVO[orden.motivo];
  const chips = el('div', 'flex flex-wrap gap-1.5');
  chips.append(
    el('span', `chip ${motivo.clase}`, motivo.texto),
    el('span', 'chip border-tinta-3 text-tinta-2', `Nivel ${NIVEL_VOLVO[orden.escenario.nivel]}`),
  );
  if (orden.estado === 'en_proceso') chips.append(el('span', 'chip border-tinta bg-placa-2', 'En proceso'));

  const unidad = el('p', 'text-sm text-tinta-2', orden.unidad);
  const titulo = el(
    'h3',
    'font-sans text-xl font-semibold leading-snug tracking-normal',
    orden.escenario.titulo,
  );
  const sintoma = el('p', 'text-[15px]', `Reporte: ${orden.escenario.sintoma}`);

  const pie = el(
    'div',
    'mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-placa-linea pt-3',
  );
  const datos = el('p', 'text-sm text-tinta-2');
  datos.append(el('span', 'codigo text-tinta', `+${orden.xpBase} XP`), ` · ${orden.minutosLimite} min`);
  const boton = el('a', 'boton', orden.estado === 'en_proceso' ? 'Continuar orden' : 'Atender orden');
  boton.href = `/tecnicos/${tecnicoId}/taller/orden/${orden.id}`;
  pie.append(datos, boton);

  li.append(arriba, chips, titulo, unidad, sintoma, pie);
  return li;
}

function pintar(datos) {
  const { nivel } = datos;
  $('nivel-nombre').textContent = nivel.nombre;
  $('nivel-xp').textContent = `${nivel.xp} XP`;
  $('nivel-barra').style.width = `${Math.round(nivel.avance * 100)}%`;
  $('nivel-siguiente').textContent = nivel.siguiente
    ? `Faltan ${nivel.siguiente.xp - nivel.xp} XP para ${nivel.siguiente.nombre}`
    : 'Nivel máximo';
  $('reputacion').textContent = datos.reputacion == null ? '—' : `${datos.reputacion} ★`;
  $('entregadas').textContent = datos.entregadas;

  $('bahia').replaceChildren(...datos.bahia.map(tarjeta));

  if (!datos.historial.length) {
    const fila = el('tr');
    const celda = el(
      'td',
      'text-tinta-3',
      'Todavía no entregas órdenes. Empieza con la primera de tu bahía.',
    );
    celda.colSpan = 5;
    fila.append(celda);
    $('historial').replaceChildren(fila);
  } else {
    $('historial').replaceChildren(
      ...datos.historial.map((o) => {
        const fila = el('tr');
        const trabajo = el('td');
        trabajo.append(
          el('span', 'block', o.escenario.titulo),
          el('span', 'text-xs text-tinta-3', o.cliente),
        );
        fila.append(
          el('td', 'codigo whitespace-nowrap', o.folio),
          trabajo,
          el(
            'td',
            `whitespace-nowrap text-lg ${o.criticos ? 'text-mal' : 'text-tinta'}`,
            estrellas(o.estrellas),
          ),
          el('td', 'codigo', `+${o.xp}`),
          el('td', 'codigo', minutos(o.segundos)),
        );
        return fila;
      }),
    );
  }

  $('bloqueados').replaceChildren(
    ...(datos.bloqueados.length
      ? datos.bloqueados.map((b) => {
          const li = el(
            'li',
            'flex items-center gap-3 border-b border-placa-linea px-4 py-3 last:border-b-0',
          );
          const numero = el('span', 'recuadro h-7 w-7 bg-nada', `${b.grupo}`);
          const texto = el('span', 'grid text-[15px]');
          texto.append(
            el('span', '', b.titulo),
            el('span', 'text-xs text-tinta-3', `Se abre en nivel ${b.nivelRequerido}`),
          );
          li.append(numero, texto);
          return li;
        })
      : [el('li', 'px-4 py-3 text-sm text-tinta-3', 'Tienes abiertos todos los trabajos.')]),
  );
}

fetch(`/api/tecnicos/${tecnicoId}/taller`)
  .then(async (r) => {
    const datos = await r.json();
    if (!r.ok) throw new Error(datos.error ?? 'No se pudo cargar el taller');
    pintar(datos);
  })
  .catch((error) => {
    $('mensaje-error').textContent = error.message;
    $('mensaje-error').hidden = false;
  });
