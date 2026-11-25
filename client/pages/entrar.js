/* eslint-disable no-use-before-define -- los pasos del flujo se llaman entre sí; son funciones elevadas. */
// Entrar con gafete (QR) + PIN.
//   1. La cámara busca el QR del gafete (o se teclea su código si la cámara falla).
//   2. El servidor dice quién es y su experiencia; el PIN se pide según esa experiencia:
//      General: teclado normal. Adulto Mayor: teclado gigante, la voz guía con el mismo texto
//      que está en pantalla y los errores se explican sin presión.
import jsQR from 'jsqr';
import { callar, hablar } from '../accesibilidad/voz.js';

const $ = (id) => document.getElementById(id);
const estado = {
  codigo: null,
  tecnico: null,
  pin: '',
  ver: false,
  mayor: false,
  flujo: null,
  buscando: false,
};

const TEXTO = {
  gafete: 'Acerca tu gafete a la cámara. Pon el código dentro del cuadro, como en el reloj checador.',
};

// ---------- Paso 1: el gafete ----------

function errorGafete(texto) {
  $('error-gafete').textContent = texto;
  $('error-gafete').hidden = !texto;
}

async function leerGafete(codigo) {
  if (estado.codigo) return;
  estado.codigo = codigo;
  errorGafete('');
  try {
    const respuesta = await fetch('/api/gafete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error);
    estado.tecnico = datos;
    mostrarPin();
  } catch (error) {
    estado.codigo = null;
    errorGafete(error.message || 'No pudimos leer el gafete.');
  }
}

async function encenderCamara() {
  try {
    // Si la cámara no responde en 8 s (permiso bloqueado, sin cámara), se ofrece teclear el código.
    const limite = new Promise((_, rechazar) => {
      setTimeout(() => rechazar(new Error('sin respuesta')), 8000);
    });
    estado.flujo = await Promise.race([
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }),
      limite,
    ]);
    const video = $('camara');
    video.srcObject = estado.flujo;
    await video.play();
    $('camara-estado').textContent = 'Buscando tu gafete…';
    estado.buscando = true;
    buscarQr();
  } catch {
    $('camara-estado').textContent = 'No hay cámara: escribe el código de tu gafete abajo.';
    $('form-codigo').closest('details').open = true;
  }
}

function apagarCamara() {
  estado.buscando = false;
  estado.flujo?.getTracks().forEach((t) => t.stop());
  estado.flujo = null;
}

// Revisa unas 6 veces por segundo una copia chica del video (leer QR en cada cuadro no hace falta).
const lienzo = document.createElement('canvas');
const ctx = lienzo.getContext('2d', { willReadFrequently: true });
function buscarQr() {
  if (!estado.buscando) return;
  const video = $('camara');
  if (video.videoWidth) {
    lienzo.width = 320;
    lienzo.height = Math.round((320 * video.videoHeight) / video.videoWidth);
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const qr = jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' });
    if (qr?.data?.toUpperCase().startsWith('CF-')) {
      $('camara-estado').textContent = '¡Listo! Gafete leído.';
      leerGafete(qr.data.trim().toUpperCase());
      return;
    }
  }
  setTimeout(buscarQr, 160);
}

$('form-codigo').addEventListener('submit', (e) => {
  e.preventDefault();
  const codigo = $('codigo').value.trim().toUpperCase();
  if (codigo) leerGafete(codigo.startsWith('CF-') ? codigo : `CF-${codigo}`);
});
$('escuchar-gafete').addEventListener('click', () => hablar(TEXTO.gafete));

// ---------- Paso 2: el PIN ----------

function textoPin() {
  const nombre = estado.tecnico.nombre.split(' ')[0];
  return estado.mayor
    ? `Hola, ${nombre}. Escribe tus cuatro números, uno por uno, con los botones grandes.`
    : `Hola, ${nombre}. Escribe tu PIN de 4 números.`;
}

function pintarPuntos() {
  const grande = estado.mayor;
  $('puntos').replaceChildren(
    ...Array.from({ length: 4 }, (_, i) => {
      const caja = document.createElement('span');
      caja.className = `grid place-items-center border-2 border-tinta font-mono font-bold ${
        grande ? 'h-20 w-16 text-4xl' : 'h-14 w-12 text-2xl'
      } ${i < estado.pin.length ? 'bg-placa-2' : 'bg-white'}`;
      if (i < estado.pin.length) caja.textContent = estado.ver ? estado.pin[i] : '●';
      return caja;
    }),
  );
}

function mensaje(tipo, titulo, texto, leer = false) {
  const caja = $('mensaje-pin');
  caja.className = `grid gap-1 border p-3 text-lg ${tipo === 'mal' ? 'border-mal bg-mal-suave' : 'border-med bg-med-suave'}`;
  caja.replaceChildren();
  const fuerte = document.createElement('strong');
  fuerte.textContent = titulo;
  const parrafo = document.createElement('span');
  parrafo.textContent = texto;
  caja.append(fuerte, parrafo);
  caja.hidden = false;
  if (leer) hablar(`${titulo}. ${texto}`);
}

async function enviarPin() {
  try {
    const respuesta = await fetch('/api/gafete/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: estado.codigo, pin: estado.pin }),
    });
    const datos = await respuesta.json();
    if (respuesta.ok) {
      apagarCamara();
      callar();
      window.location.assign(datos.destino);
      return;
    }
    estado.pin = '';
    pintarPuntos();
    if (respuesta.status === 429) {
      mensaje('mal', 'Espera un minuto', datos.error, estado.mayor);
    } else if (estado.mayor) {
      // Sin presión: se explica qué hacer y cuándo pedir ayuda.
      mensaje(
        'pista',
        'No pasa nada, inténtalo otra vez',
        datos.restantes <= 2
          ? 'Si no recuerdas tus números, toca "Olvidé mi PIN" y el responsable de tu taller te ayuda.'
          : 'Escribe tus cuatro números despacio. Puedes tocar "Ver mis números" para revisarlos.',
        true,
      );
    } else {
      mensaje('mal', 'Ese PIN no coincide', `Te quedan ${datos.restantes} intentos.`);
    }
  } catch {
    mensaje('mal', 'Sin conexión', 'No pudimos entrar. Intenta otra vez.', estado.mayor);
  }
}

function teclear(digito) {
  if (estado.pin.length >= 4) return;
  estado.pin += digito;
  pintarPuntos();
  if (estado.pin.length === 4) enviarPin();
}

function borrar() {
  estado.pin = estado.pin.slice(0, -1);
  pintarPuntos();
}

function pintarTeclado() {
  const grande = estado.mayor;
  const clase = `border-2 border-tinta bg-white font-semibold hover:bg-placa active:bg-placa-2 ${
    grande ? 'h-24 text-4xl' : 'h-16 text-2xl'
  }`;
  const boton = (texto, accion, etiqueta = texto) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = clase;
    b.textContent = texto;
    b.setAttribute('aria-label', etiqueta);
    b.addEventListener('click', accion);
    return b;
  };
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => boton(d, () => teclear(d)));
  const vacio = document.createElement('span');
  $('teclado').replaceChildren(
    ...teclas,
    vacio,
    boton('0', () => teclear('0')),
    boton('⌫', borrar, 'Borrar el último número'),
  );
  $('teclado').className = `mx-auto grid w-full grid-cols-3 gap-3 ${grande ? 'max-w-md' : 'max-w-sm'}`;
}

function mostrarPin() {
  estado.mayor = estado.tecnico.experiencia === 'mayor';
  estado.pin = '';
  $('paso-gafete').hidden = true;
  $('paso-pin').hidden = false;
  $('con-correo').hidden = true;
  $('saludo').textContent = `Hola, ${estado.tecnico.nombre}`;
  $('taller').textContent = estado.tecnico.taller;
  $('instruccion-pin').textContent = textoPin();
  $('instruccion-pin').className = estado.mayor ? 'text-2xl font-semibold' : 'text-xl';
  $('mensaje-pin').hidden = true;
  pintarPuntos();
  pintarTeclado();
  // Adulto Mayor: la voz guía desde el primer momento, con el mismo texto de la pantalla.
  if (estado.mayor) hablar(textoPin());
}

$('escuchar-pin').addEventListener('click', () => hablar(textoPin()));
$('ver-numeros').addEventListener('click', () => {
  estado.ver = !estado.ver;
  $('ver-numeros').textContent = estado.ver ? '🙈 Ocultar mis números' : '👁 Ver mis números';
  pintarPuntos();
});
$('no-soy-yo').addEventListener('click', () => {
  Object.assign(estado, { codigo: null, tecnico: null, pin: '' });
  callar();
  $('paso-pin').hidden = true;
  $('paso-gafete').hidden = false;
  $('con-correo').hidden = false;
  $('camara-estado').textContent = 'Buscando tu gafete…';
  if (estado.flujo) {
    estado.buscando = true;
    buscarQr();
  }
});
$('olvide').addEventListener('click', () =>
  mensaje(
    'pista',
    'Pide tu PIN al responsable de tu taller',
    'Él te da uno nuevo en un momento desde su cuenta. Es solo para tu capacitación.',
    true,
  ),
);
// Teclado físico también funciona.
window.addEventListener('keydown', (e) => {
  if ($('paso-pin').hidden) return;
  if (/^\d$/.test(e.key)) teclear(e.key);
  if (e.key === 'Backspace') borrar();
});

encenderCamara();
