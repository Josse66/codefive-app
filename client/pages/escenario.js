// Práctica con escenario en pantalla dividida: a la izquierda la hipótesis o la instrucción y las
// herramientas; a la derecha el autobús en 3D. Cada intento se manda a POST /api/eventos y el
// servidor decide si fue correcto. Mouse, cámara y guante llegan por el mismo InputBus.
import { crearEscena } from '../escena/autobus3d.js';
import { InputBus } from '../entradas/inputBus.js';
import { SerialGlove } from '../entradas/serialGlove.js';

const raiz = document.getElementById('escenario');
const { tecnicoId, escenarioId, ordenId } = raiz.dataset;
const $ = (id) => document.getElementById(id);

const PROFUNDIDAD = { completo: 'escenario completo', ligero: 'escenario ligero' };
const ESTADO = { dominada: 'Dominada', en_desarrollo: 'En desarrollo', brecha: 'Brecha' };
const CLASE_OPCION =
  'flex w-full items-start gap-3 border border-placa-linea bg-white p-3 text-left text-[15px] transition-colors duration-150 hover:border-tinta disabled:cursor-default disabled:hover:border-placa-linea';
const CLASE_HERRAMIENTA =
  'border border-placa-linea bg-white px-3 py-3 text-left text-[15px] font-semibold transition-colors duration-150 hover:border-tinta aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-white';

const estado = {
  datos: null,
  escena: null,
  paso: 0,
  subpaso: 0,
  herramienta: null,
  encima: null,
  pista: false,
  inicio: 0,
  ocupado: false,
  esperandoContinuar: false,
  errores: 0,
  criticos: 0,
};

async function pedir(url, opciones) {
  const respuesta = await fetch(url, opciones);
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error ?? 'Algo salió mal');
  return datos;
}

function mostrarError(mensaje) {
  $('mensaje-error').textContent = mensaje;
  $('mensaje-error').hidden = false;
}

const el = (etiqueta, clase, texto) => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto != null) nodo.textContent = texto;
  return nodo;
};

function mostrarDominio(pSaber, competenciaId) {
  const porcentaje = Math.round(pSaber * 100);
  let texto = ESTADO.brecha;
  if (porcentaje >= 80) texto = ESTADO.dominada;
  else if (porcentaje >= 40) texto = ESTADO.en_desarrollo;
  $('dominio-texto').textContent = `${porcentaje} % · ${texto}`;
  $('dominio-barra').style.width = `${porcentaje}%`;
  if (competenciaId) $('dominio-codigo').textContent = competenciaId;
}

// ---------- Pasos ----------

function pintarPasos() {
  const { pasos } = estado.datos.escenario;
  $('pasos').replaceChildren(
    ...pasos.map((p, i) => {
      let clase = 'border-placa-linea bg-white text-tinta-3';
      if (i < estado.paso) clase = 'border-ok bg-ok-suave text-ok';
      else if (i === estado.paso) clase = 'border-tinta bg-tinta text-white';
      const li = el('li', `codigo border px-2.5 py-1 text-sm ${clase}`, `${i + 1}`);
      li.title = p.tipo === 'hipotesis' ? 'Hipótesis' : 'Acción';
      if (i === estado.paso) li.setAttribute('aria-current', 'step');
      return li;
    }),
  );
}

function retro(tipo, titulo, texto) {
  const caja = $('retro');
  const clases = {
    ok: 'border-ok bg-ok-suave',
    mal: 'border-mal bg-mal-suave',
    neutro: 'border-placa-linea bg-placa',
  };
  caja.className = `grid gap-1 border p-3 text-[15px] ${clases[tipo]}`;
  const colores = { ok: 'text-ok', mal: 'text-mal', neutro: 'text-tinta' };
  caja.replaceChildren(el('p', `font-semibold ${colores[tipo]}`, titulo), el('p', '', texto));
  caja.hidden = false;
}

function elegirHerramienta(id) {
  estado.herramienta = id;
  estado.escena.elegirHerramienta(id);
  $('bandeja')
    .querySelectorAll('button')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
}

const TIPO_PASO = {
  hipotesis: 'Formula tu hipótesis',
  reemplazo: 'Elige la refacción',
  accion: 'Hazlo en el autobús',
};
const pesos = (n) => `${Number(n).toLocaleString('es-MX')}`;
const reloj = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function mostrarGasto(gasto) {
  $('orden-gasto').textContent = pesos(gasto);
}

// Reloj de la orden: se pone en ámbar al pasar el tiempo objetivo.
function iniciarReloj(minutosLimite) {
  const inicio = performance.now();
  setInterval(() => {
    if (estado.entrega) return;
    const segundos = (performance.now() - inicio) / 1000;
    $('orden-reloj').textContent = `${reloj(segundos)} / ${minutosLimite}:00`;
    $('orden-reloj').classList.toggle('text-med-texto', segundos > minutosLimite * 60);
  }, 500);
}

function mostrarEntrega(entrega) {
  $('paso').hidden = true;
  elegirHerramienta(null);
  $('entrega-estrellas').textContent = '★'.repeat(entrega.estrellas) + '☆'.repeat(3 - entrega.estrellas);
  $('entrega-xp').textContent = `+${entrega.xp} puntos de taller`;
  $('entrega-desglose').replaceChildren(
    ...entrega.desglose.map((d) => {
      const fila = el('li', 'flex justify-between gap-4 border-b border-placa-linea py-1.5 last:border-b-0');
      fila.append(
        el('span', '', d.concepto),
        el('span', `codigo ${d.puntos < 0 ? 'text-mal' : ''}`, `${d.puntos > 0 ? '+' : ''}${d.puntos}`),
      );
      return fila;
    }),
  );
  $('entrega-datos').textContent =
    `Tiempo ${reloj(entrega.segundos)} de ${entrega.minutosLimite}:00 · refacciones ${pesos(entrega.gasto)}${
      entrega.gasto > entrega.gastoNecesario ? ` (necesarias: ${pesos(entrega.gastoNecesario)})` : ''
    }`;
  const { nivelDespues: nivel } = entrega;
  $('entrega-nivel').textContent = entrega.subioNivel
    ? `¡Subiste al nivel ${nivel.nombre}!`
    : `Nivel ${nivel.nombre} · ${nivel.xp} puntos de taller`;
  $('entrega-nivel').classList.toggle('text-ok', entrega.subioNivel);
  $('entrega-barra').style.width = `${Math.round(nivel.avance * 100)}%`;
  $('entrega-evaluacion').href = `/tecnicos/${tecnicoId}/evaluacion/${estado.datos.escenario.competencia}`;
  $('entrega').hidden = false;
  $('entrega-volver').focus();
}

// ---------- Intentos ----------

async function enviar(intento, inputDevice) {
  if (estado.ocupado || estado.esperandoContinuar) return;
  estado.ocupado = true;
  const paso = estado.datos.escenario.pasos[estado.paso];
  try {
    const r = await pedir('/api/eventos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tecnicoId,
        escenarioId,
        pasoId: paso.id,
        ...intento,
        ordenId: ordenId || undefined,
        pista: estado.pista,
        inputDevice,
        ms: Math.round(performance.now() - estado.inicio),
      }),
    });
    mostrarDominio(r.dominio.despues, r.dominio.competenciaId);
    if (r.gasto != null) mostrarGasto(r.gasto);
    if (r.entrega) estado.entrega = r.entrega;
    // En un cambio de refacción la pieza del autobús es la del paso.
    const pieza = intento.accion?.split('>')[1] ?? (paso.tipo === 'reemplazo' ? paso.pieza : undefined);

    if (r.correcta) {
      if (r.efecto) estado.escena.efecto(r.efecto, pieza);
      if (!r.completaPaso) {
        estado.subpaso = r.progreso.subpaso;
        $('subpaso').textContent = `Acción ${estado.subpaso + 1} de ${paso.acciones}`;
        retro('neutro', 'Bien', `${estado.escena.nombrePieza(pieza)}: hecho. Sigue con la siguiente acción.`);
        return;
      }
      if (paso.tipo === 'reemplazo' && pieza) estado.escena.efecto('cambio', pieza);
      if (pieza) estado.escena.marcarPieza(pieza, intento.accion?.startsWith('candado') ? 'candado' : 'ok');
      retro('ok', 'Correcto', r.explicacion);
      estado.paso = r.progreso.paso;
      estado.subpaso = 0;
      estado.esperandoContinuar = true;
      $('opciones')
        .querySelectorAll('button')
        .forEach((b) => b.setAttribute('disabled', ''));
      const final = ordenId ? 'Entregar la unidad' : 'Ver resultado';
      $('boton-continuar').textContent = r.terminado ? final : 'Continuar';
      $('boton-continuar').hidden = false;
      $('boton-continuar').focus();
      if (r.terminado) estado.terminado = true;
      return;
    }

    estado.errores += 1;
    estado.subpaso = 0;
    if (paso.tipo === 'accion') $('subpaso').textContent = `Acción 1 de ${paso.acciones}`;
    if (r.error.efecto) estado.escena.efecto(r.error.efecto, pieza);
    if (r.error.critico) {
      estado.criticos += 1;
      $('bloqueo-titulo').textContent = r.error.codigo ?? 'Error crítico';
      $('bloqueo-mensaje').textContent = r.error.mensaje;
      $('bloqueo').hidden = false;
      $('boton-bloqueo').focus();
    }
    retro('mal', r.error.codigo ? `No es correcto · ${r.error.codigo}` : 'No es correcto', r.error.mensaje);
  } catch (error) {
    mostrarError(error.message);
  } finally {
    estado.ocupado = false;
  }
}

function pintarPaso() {
  const { pasos } = estado.datos.escenario;
  const paso = pasos[estado.paso];
  Object.assign(estado, { pista: false, inicio: performance.now(), esperandoContinuar: false });
  pintarPasos();
  $('paso-numero').textContent = `Paso ${estado.paso + 1} de ${pasos.length} · ${TIPO_PASO[paso.tipo]}`;
  $('paso-texto').textContent = paso.tipo === 'accion' ? paso.instruccion : paso.pregunta;
  $('retro').hidden = true;
  $('pista').hidden = true;
  $('boton-continuar').hidden = true;
  $('boton-pista').hidden = !paso.pista;

  if (paso.tipo !== 'accion') {
    $('herramientas').hidden = true;
    $('subpaso').hidden = true;
    elegirHerramienta(null);
    $('opciones').replaceChildren(
      ...paso.opciones.map((opcion, posicion) => {
        const boton = el('button', CLASE_OPCION);
        boton.type = 'button';
        boton.append(
          el(
            'span',
            'codigo flex h-6 w-6 shrink-0 items-center justify-center border border-tinta text-sm',
            'ABCD'[posicion],
          ),
          el('span', 'flex-1', opcion.texto),
        );
        // Las refacciones muestran su precio: cambiar la que no era cuesta.
        if (opcion.costo != null)
          boton.append(el('span', 'codigo whitespace-nowrap text-tinta-2', pesos(opcion.costo)));
        boton.addEventListener('click', () => enviar({ opcion: opcion.id }, 'mouse'));
        return boton;
      }),
    );
    $('opciones').hidden = false;
  } else {
    $('opciones').hidden = true;
    $('herramientas').hidden = false;
    $('subpaso').hidden = paso.acciones < 2;
    $('subpaso').textContent = `Acción ${estado.subpaso + 1} de ${paso.acciones}`;
    $('bandeja').replaceChildren(
      ...estado.datos.escenario.herramientas.map((h) => {
        const boton = el('button', CLASE_HERRAMIENTA, h.nombre);
        boton.type = 'button';
        boton.dataset.id = h.id;
        boton.setAttribute('aria-pressed', 'false');
        boton.addEventListener('click', () => elegirHerramienta(h.id));
        return boton;
      }),
    );
    elegirHerramienta(estado.herramienta);
  }
  $('paso').hidden = false;
}

function terminar() {
  pintarPasos();
  $('paso').hidden = true;
  elegirHerramienta(null);
  const { competencia } = estado.datos.escenario;
  $('final-texto').textContent =
    estado.errores === 0
      ? 'Sin errores. Ahora comprueba lo aprendido con la evaluación de después.'
      : `Terminaste con ${estado.errores} ${estado.errores === 1 ? 'error' : 'errores'}${
          estado.criticos
            ? `, ${estado.criticos} crítico${estado.criticos === 1 ? '' : 's'} de seguridad`
            : ''
        }. Repite el escenario o pasa a la evaluación de después.`;
  if (!$('enlace-evaluacion').dataset.mision) {
    if (!$('enlace-evaluacion').dataset.mision) {
      $('enlace-evaluacion').href = `/tecnicos/${tecnicoId}/evaluacion/${competencia}`;
    }
  }
  $('final').hidden = false;
}

$('boton-continuar').addEventListener('click', () => {
  if (estado.terminado && estado.entrega) mostrarEntrega(estado.entrega);
  else if (estado.terminado) terminar();
  else pintarPaso();
});

$('boton-pista').addEventListener('click', () => {
  const paso = estado.datos.escenario.pasos[estado.paso];
  estado.pista = true;
  $('pista').textContent = `Pista: ${paso.pista}`;
  $('pista').hidden = false;
  $('boton-pista').hidden = true;
});

$('boton-bloqueo').addEventListener('click', () => {
  $('bloqueo').hidden = true;
});

$('boton-repetir').addEventListener('click', () => window.location.reload());

// ---------- Entradas: mouse, cámara y guante ----------

const bus = new InputBus();

function conectarEntradas() {
  bus.conectarMouse(estado.escena.lienzo);
  bus.addEventListener('pose', ({ detail }) => {
    const encima = estado.escena.moverHerramienta(detail.x, detail.y, bus.fuentes.guante ? detail : null);
    estado.encima = encima?.pieza ?? null;
    estado.escena.resaltar(estado.encima?.id ?? null);
    $('etiqueta-pieza').hidden = !estado.encima;
    if (estado.encima) $('etiqueta-pieza').textContent = estado.encima.nombre;
  });
  bus.addEventListener('grab', ({ detail }) => {
    const paso = estado.datos.escenario.pasos[estado.paso];
    if (!paso || paso.tipo !== 'accion' || estado.esperandoContinuar || !$('bloqueo').hidden) return;
    const encima = estado.escena.piezaEn(detail.x, detail.y)?.pieza;
    if (!encima) return;
    if (!estado.herramienta) {
      retro('neutro', 'Elige una herramienta', 'Selecciona en la bandeja con qué vas a trabajar.');
      return;
    }
    enviar({ accion: `${estado.herramienta}>${encima.id}` }, detail.source);
  });
  bus.addEventListener('fuentes', ({ detail }) => {
    document.querySelectorAll('[data-fuente]').forEach((chip) => {
      const activa = detail[chip.dataset.fuente];
      chip.setAttribute(
        'class',
        `chip ${activa ? 'border-ok bg-ok-suave text-ok' : 'border-nada bg-nada-suave text-tinta-3'}`,
      );
    });
  });
}

$('boton-guante').addEventListener('click', async () => {
  try {
    const guante = new SerialGlove();
    await guante.conectar();
    bus.conectarGuante(guante);
    $('entradas-mensaje').textContent = 'Guante conectado: el giro mueve la herramienta y el botón la usa.';
  } catch (error) {
    $('entradas-mensaje').textContent = `No se conectó el guante: ${error.message}`;
  }
});

$('boton-camara').addEventListener('click', async () => {
  try {
    // MediaPipe se carga solo si se pide la cámara: sin cámara la práctica sigue con el mouse.
    const { HandTracker } = await import('../entradas/handTracker.js');
    $('video').hidden = false;
    const tracker = new HandTracker($('video'));
    await tracker.iniciar();
    bus.conectarCamara(tracker);
    $('entradas-mensaje').textContent = 'Cámara activa: junta pulgar e índice para usar la herramienta.';
  } catch (error) {
    $('video').hidden = true;
    $('entradas-mensaje').textContent = `No se inició la cámara: ${error.message}`;
  }
});

// ---------- Carga ----------

const carga = ordenId
  ? pedir(`/api/tecnicos/${tecnicoId}/taller/ordenes/${ordenId}/iniciar`, { method: 'POST' })
  : pedir(`/api/tecnicos/${tecnicoId}/escenarios/${escenarioId}`);

carga
  .then((datos) => {
    estado.datos = datos;
    if (datos.orden) {
      const { orden } = datos;
      $('orden-folio').textContent = orden.folio;
      $('orden-cliente').textContent = `${orden.cliente} · ${orden.unidad}`;
      $('orden-barra').hidden = false;
      mostrarGasto(0);
      iniciarReloj(orden.minutosLimite);
    }
    const { escenario } = datos;
    $('titulo').textContent = escenario.titulo;
    $('grupo').textContent = escenario.grupo;
    $('sintoma').textContent = escenario.sintoma;
    $('profundidad').textContent = PROFUNDIDAD[escenario.profundidad] ?? '';
    $('marca-hv').hidden = !(escenario.tecnologia === 'electrica' && escenario.grupo === 3);
    $('fuente').textContent =
      `Fuente: ${escenario.fuente}. Valores de demostración, sin información confidencial de Volvo.`;
    mostrarDominio(datos.pSaber, escenario.competencia);
    estado.escena = crearEscena($('lienzo'), {
      autobus: datos.autobus,
      piezas: escenario.piezas,
      enfoque: escenario.enfoque,
    });
    conectarEntradas();
    pintarPaso();
  })
  .catch((error) => mostrarError(error.message));
