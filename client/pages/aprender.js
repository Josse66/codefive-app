// Temario del Modo Aprender: los 9 grupos de función con sus lecciones por nivel, el avance del
// técnico y la lección que le recomienda su ruta.
const raiz = document.getElementById('aprender');
const { tecnicoId } = raiz.dataset;
const $ = (id) => document.getElementById(id);

const NIVEL = { 1: 'Básico', 2: 'Medio', 3: 'Avanzado' };
const CHIP = {
  dominada: 'border-ok bg-ok-suave text-ok',
  en_desarrollo: 'border-med bg-med-suave text-med-texto',
  brecha: 'border-mal bg-mal-suave text-mal',
};

const el = (etiqueta, clase, texto) => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto != null) nodo.textContent = texto;
  return nodo;
};

function filaLeccion(l) {
  const enlace = el(
    'a',
    `grid gap-1 border-b border-placa-linea px-4 py-3 no-underline last:border-b-0 hover:bg-placa ${
      l.recomendada ? 'bg-placa-2' : ''
    }`,
  );
  enlace.href = `/tecnicos/${tecnicoId}/aprender/${l.id}`;
  const arriba = el('span', 'flex items-baseline justify-between gap-3');
  arriba.append(
    el(
      'span',
      'font-narrow text-xs font-bold uppercase tracking-wider text-tinta-3',
      `Nivel ${NIVEL[l.nivel]}`,
    ),
    el('span', 'text-xs text-tinta-3', `${l.minutos} min${l.vista ? ' · leída ✓' : ''}`),
  );
  const titulo = el('span', `text-[16px] ${l.vista ? 'text-tinta-2' : 'font-semibold text-tinta'}`, l.titulo);
  const chips = el('span', 'flex flex-wrap gap-1.5');
  chips.append(
    el('span', `chip ${CHIP[l.competencia.estado]}`, `${Math.round(l.competencia.pSaber * 100)} % dominio`),
  );
  if (l.critica) chips.append(el('span', 'chip border-mal bg-mal-suave text-mal', 'Seguridad crítica'));
  if (l.tecnologia === 'electrica') chips.append(el('span', 'marca-hv', 'Alto voltaje'));
  if (l.recomendada) chips.append(el('span', 'chip border-tinta bg-tinta text-white', 'Recomendada'));
  enlace.append(arriba, titulo, chips);
  return enlace;
}

function pintar(datos) {
  const { avance, recomendada, grupos } = datos;
  $('avance-texto').textContent = `${avance.vistas} de ${avance.total} lecciones`;
  $('avance-barra').style.width = `${Math.round((avance.vistas / avance.total) * 100)}%`;

  if (recomendada) {
    $('recomendada-titulo').textContent = recomendada.titulo;
    $('recomendada-motivo').textContent = `Por qué: ${recomendada.motivo}.`;
    $('recomendada-enlace').href = `/tecnicos/${tecnicoId}/aprender/${recomendada.leccion}`;
    $('recomendada').hidden = false;
  }

  $('grupos').replaceChildren(
    ...grupos
      .filter((g) => g.lecciones.length)
      .map((g) => {
        const tarjeta = el('article', 'grid content-start border border-tinta bg-white');
        const cabeza = el('header', 'flex items-center gap-3 border-b border-tinta px-4 py-3');
        cabeza.append(el('span', 'recuadro h-8 w-8 text-lg', `${g.grupo}`), el('h2', 'text-xl', g.nombre));
        const lista = el('div', 'grid');
        lista.append(...g.lecciones.map(filaLeccion));
        tarjeta.append(cabeza, lista);
        return tarjeta;
      }),
  );
}

fetch(`/api/tecnicos/${tecnicoId}/aprender`)
  .then(async (r) => {
    const datos = await r.json();
    if (!r.ok) throw new Error(datos.error ?? 'No se pudo cargar el temario');
    pintar(datos);
  })
  .catch((error) => {
    $('mensaje-error').textContent = error.message;
    $('mensaje-error').hidden = false;
  });
