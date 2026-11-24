// Pantalla del diagnóstico: muestra una pregunta a la vez, pide la confianza y manda la respuesta.
const raiz = document.getElementById('diagnostico');
const { tecnicoId } = raiz.dataset;

const el = {
  tarjeta: document.getElementById('tarjeta-pregunta'),
  area: document.getElementById('pregunta-area'),
  grupo: document.getElementById('pregunta-grupo'),
  enunciado: document.getElementById('pregunta-enunciado'),
  opciones: document.getElementById('pregunta-opciones'),
  confianza: document.getElementById('confianza'),
  siguiente: document.getElementById('boton-siguiente'),
  progresoTexto: document.getElementById('progreso-texto'),
  progresoBarra: document.getElementById('progreso-barra'),
  error: document.getElementById('mensaje-error'),
};

const TECNOLOGIA = { diesel: 'Diésel', electrica: 'Eléctrico', ambas: 'Diésel y eléctrico' };
const GRUPO = {
  1: 'Servicio y mantenimiento',
  2: 'Motor',
  3: 'Sistema eléctrico',
  4: 'Transmisión',
  5: 'Frenos',
  6: 'Ejes, suspensión y dirección',
  7: 'Bastidor y ruedas',
  8: 'Carrocería e interior',
  9: 'Misceláneos',
};
const CLASE_OPCION =
  'flex w-full items-start gap-3 border border-placa-linea bg-white p-4 text-left text-[16px] transition-colors duration-150 hover:border-tinta aria-checked:border-tinta aria-checked:bg-placa-2 aria-checked:shadow-[inset_0_0_0_1px_#141c24]';
const CLASE_LETRA = 'codigo flex h-6 w-6 shrink-0 items-center justify-center border border-tinta text-sm';

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
  el.grupo.textContent = competencia.grupo;
  el.area.textContent = `${GRUPO[competencia.grupo]} · ${TECNOLOGIA[competencia.tecnologia]} · Nivel ${competencia.nivel}`;
  el.enunciado.textContent = pregunta.enunciado;
  el.opciones.replaceChildren(
    ...pregunta.opciones.map((opcion) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = CLASE_OPCION;
      boton.setAttribute('role', 'radio');
      boton.setAttribute('aria-checked', 'false');
      const letra = document.createElement('span');
      letra.className = CLASE_LETRA;
      letra.textContent = opcion.id.toUpperCase();
      const texto = document.createElement('span');
      texto.textContent = opcion.texto;
      boton.append(letra, texto);
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
}

el.confianza.querySelectorAll('button').forEach((boton) => {
  boton.setAttribute('class', `${CLASE_OPCION} justify-center font-semibold`);
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
