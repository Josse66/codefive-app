// Gafetes de capacitación: QR con el código del gafete, PIN y experiencia de cada técnico.
import QRCode from 'qrcode';

const $ = (id) => document.getElementById(id);
const EXPERIENCIA = { general: 'General', mayor: 'Adulto Mayor' };

const el = (etiqueta, clase = '', texto = '') => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto) nodo.textContent = texto;
  return nodo;
};

function avisar(texto) {
  $('mensaje').textContent = texto;
  $('mensaje').hidden = false;
}

async function guardar(id, cambios) {
  const respuesta = await fetch(`/api/gafetes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios),
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error);
  return datos;
}

function tarjeta(t) {
  const li = el('li', 'grid gap-3 border-2 border-tinta bg-white p-4 break-inside-avoid');
  // Frente del gafete (lo que se imprime).
  const frente = el('div', 'flex items-center gap-4');
  const qr = el('canvas', 'h-32 w-32 shrink-0');
  QRCode.toCanvas(qr, t.credencial ?? '', { width: 128, margin: 1 });
  const datos = el('div', 'grid gap-1');
  datos.append(
    el(
      'p',
      'font-narrow text-xs font-bold uppercase tracking-wider text-tinta-3',
      'Capacitación · Técnicos del Mañana',
    ),
    el('p', 'text-xl font-semibold leading-tight', t.nombre),
    el('p', 'text-sm text-tinta-2', t.taller),
    el('p', 'font-mono text-lg tracking-widest', t.credencial ?? '—'),
  );
  frente.append(qr, datos);
  li.append(frente);

  // Controles del responsable (no se imprimen).
  const controles = el('div', 'grid gap-2 border-t border-placa-linea pt-3 text-sm print:hidden');
  const fila = el('div', 'flex flex-wrap items-center gap-2');
  const experiencia = el('select', 'border border-tinta-3 px-2 py-1.5');
  Object.entries(EXPERIENCIA).forEach(([valor, texto]) => {
    const op = el('option', '', `Experiencia ${texto}`);
    op.value = valor;
    op.selected = t.experiencia === valor;
    experiencia.append(op);
  });
  experiencia.addEventListener('change', async () => {
    await guardar(t.id, { experiencia: experiencia.value });
    avisar(`${t.nombre}: ahora usa la Experiencia ${EXPERIENCIA[experiencia.value]}.`);
  });
  const pin = el('input', 'w-24 border border-tinta-3 px-2 py-1.5 font-mono');
  pin.placeholder = 'PIN nuevo';
  pin.inputMode = 'numeric';
  pin.maxLength = 4;
  const ponerPin = el('button', 'boton-linea px-3 py-1.5', 'Dar PIN');
  ponerPin.type = 'button';
  ponerPin.addEventListener('click', async () => {
    try {
      await guardar(t.id, { pin: pin.value });
      avisar(`${t.nombre} ya puede entrar con su PIN nuevo.`);
      pin.value = '';
    } catch (error) {
      avisar(error.message);
    }
  });
  fila.append(experiencia, pin, ponerPin);
  const nuevo = el('button', 'w-fit text-tinta-2 underline', 'Gafete nuevo (si lo perdió)');
  nuevo.type = 'button';
  nuevo.addEventListener('click', async () => {
    const actualizado = await guardar(t.id, { nuevoGafete: true });
    avisar(`${t.nombre}: gafete nuevo ${actualizado.credencial}. Imprímelo; el anterior ya no sirve.`);
    li.replaceWith(tarjeta(actualizado));
  });
  controles.append(fila, nuevo);
  li.append(controles);
  return li;
}

$('imprimir').addEventListener('click', () => window.print());

fetch('/api/gafetes')
  .then((r) => r.json())
  .then((lista) => $('lista').replaceChildren(...lista.map(tarjeta)))
  .catch(() => avisar('No se pudieron cargar los gafetes.'));
