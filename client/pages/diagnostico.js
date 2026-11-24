// Pantalla del diagnóstico: muestra una pregunta a la vez, pide la confianza y manda la respuesta.
const raiz = document.getElementById('diagnostico');
const { tecnicoId } = raiz.dataset;

const el = {
  tarjeta: document.getElementById('tarjeta-pregunta'),
  area: document.getElementById('pregunta-area'),
  enunciado: document.getElementById('pregunta-enunciado'),
  opciones: document.getElementById('pregunta-opciones'),
  confianza: document.getElementById('confianza'),
  siguiente: document.getElementById('boton-siguiente'),
  progresoTexto: document.getElementById('progreso-texto'),
  progresoBarra: document.getElementById('progreso-barra'),
  error: document.getElementById('mensaje-error'),
};

const TECNOLOGIA = { diesel: 'Diésel', electrica: 'Eléctrico', ambas: 'Diésel y eléctrico' };
const CLASE_OPCION =
  'w-full rounded border-2 border-acero-100 bg-white p-4 text-left transition hover:border-acero-600 aria-checked:border-hv-500 aria-checked:bg-hv-100';

const estado = { sesionId: null, pregunta: null, opcion: null, confianza: null, inicio: 0 };

async function pedir(url, cuerpo) {
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error ?? 'No se pudo enviar la respuesta');
  return datos;
}

function mostrarError(mensaje) {
  el.error.textContent = mensaje;
  el.error.hidden = false;
}

function actualizarBoton() {
  el.siguiente.disabled = !(estado.opcion && estado.confianza);
}

function marcar(contenedor, seleccionado) {
  contenedor.querySelectorAll('[aria-checked]').forEach((b) => {
    b.setAttribute('aria-checked', String(b === seleccionado));
  });
}

function mostrarProgreso({ respondidas, estimado }) {
  el.progresoTexto.textContent = `Pregunta ${respondidas + 1} de unas ${estimado}`;
  el.progresoBarra.style.width = `${Math.round((respondidas / estimado) * 100)}%`;
}

function mostrarPregunta(pregunta, progreso) {
  Object.assign(estado, { pregunta, opcion: null, confianza: null, inicio: performance.now() });
  const { competencia } = pregunta;
  el.area.textContent = `${TECNOLOGIA[competencia.tecnologia]} · Grupo ${competencia.grupo} · Nivel ${competencia.nivel}`;
  el.enunciado.textContent = pregunta.enunciado;
  el.opciones.replaceChildren(
    ...pregunta.opciones.map((opcion) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = CLASE_OPCION;
      boton.setAttribute('role', 'radio');
      boton.setAttribute('aria-checked', 'false');
      boton.textContent = opcion.texto;
      boton.addEventListener('click', () => {
        estado.opcion = opcion.id;
        marcar(el.opciones, boton);
        el.confianza.disabled = false;
        actualizarBoton();
      });
      return boton;
    }),
  );
  el.confianza.disabled = true;
  el.confianza.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', 'false'));
  el.siguiente.disabled = true;
  el.tarjeta.hidden = false;
  mostrarProgreso(progreso);
  el.opciones.querySelector('button')?.focus();
}

el.confianza.querySelectorAll('button').forEach((boton) => {
  boton.setAttribute('class', CLASE_OPCION);
  boton.setAttribute('role', 'radio');
  boton.setAttribute('aria-checked', 'false');
  boton.addEventListener('click', () => {
    estado.confianza = Number(boton.dataset.valor);
    marcar(el.confianza, boton);
    actualizarBoton();
  });
});

el.siguiente.addEventListener('click', async () => {
  el.siguiente.disabled = true;
  el.error.hidden = true;
  try {
    const resultado = await pedir(`/api/diagnostico/${estado.sesionId}/respuestas`, {
      preguntaId: estado.pregunta.id,
      opcion: estado.opcion,
      confianza: estado.confianza,
      ms: performance.now() - estado.inicio,
      inputDevice: 'mouse',
    });
    if (resultado.terminado) {
      window.location.assign(`/tecnicos/${tecnicoId}/perfil`);
      return;
    }
    mostrarPregunta(resultado.pregunta, resultado.progreso);
  } catch (error) {
    mostrarError(error.message);
    actualizarBoton();
  }
});

pedir('/api/diagnostico', { tecnicoId })
  .then(({ sesionId, pregunta, progreso }) => {
    estado.sesionId = sesionId;
    mostrarPregunta(pregunta, progreso);
  })
  .catch((error) => mostrarError(error.message));
