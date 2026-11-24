// Pantalla de práctica: microlección según el modo de ayuda, preguntas con confianza,
// pista opcional y retroalimentación con la explicación y la fuente.
const raiz = document.getElementById('practica');
const { tecnicoId, competenciaId } = raiz.dataset;
const $ = (id) => document.getElementById(id);

const TECNOLOGIA = { diesel: 'Diésel', electrica: 'Eléctrico', ambas: 'Diésel y eléctrico' };
const MODO = { guiado: 'Guiado', con_pistas: 'Con pistas', autonomo: 'Autónomo' };
const ESTADO = { dominada: 'Dominada', en_desarrollo: 'En desarrollo', brecha: 'Brecha' };
const CLASE_OPCION =
  'flex w-full items-start gap-3 border border-placa-linea bg-white p-4 text-left text-[16px] transition-colors duration-150 hover:border-tinta aria-checked:border-tinta aria-checked:bg-placa-2 aria-checked:shadow-[inset_0_0_0_1px_#141c24] disabled:cursor-default disabled:hover:border-placa-linea';
const CLASE_LETRA = 'codigo flex h-6 w-6 shrink-0 items-center justify-center border border-tinta text-sm';

const estado = {
  datos: null,
  indice: 0,
  opcion: null,
  confianza: null,
  pista: false,
  inicio: 0,
  aciertos: 0,
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

function mostrarDominio(pSaber, modo) {
  const porcentaje = Math.round(pSaber * 100);
  let estadoTexto = ESTADO.brecha;
  if (porcentaje >= 80) estadoTexto = ESTADO.dominada;
  else if (porcentaje >= 40) estadoTexto = ESTADO.en_desarrollo;
  $('dominio-texto').textContent = `${porcentaje} % · ${estadoTexto}`;
  $('dominio-barra').style.width = `${porcentaje}%`;
  $('modo-texto').textContent = MODO[modo];
}

function marcar(contenedor, seleccionado) {
  contenedor
    .querySelectorAll('[aria-checked]')
    .forEach((b) => b.setAttribute('aria-checked', String(b === seleccionado)));
}

function actualizarComprobar() {
  $('boton-comprobar').disabled = !(estado.opcion && estado.confianza);
}

function mostrarPregunta() {
  const { preguntas, pista } = estado.datos;
  const pregunta = preguntas[estado.indice];
  Object.assign(estado, { opcion: null, confianza: null, pista: false, inicio: performance.now() });

  $('pregunta-numero').textContent = `Pregunta ${estado.indice + 1} de ${preguntas.length}`;
  $('pregunta-enunciado').textContent = pregunta.enunciado;
  $('pregunta-opciones').replaceChildren(
    ...pregunta.opciones.map((opcion) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = CLASE_OPCION;
      boton.dataset.id = opcion.id;
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
        marcar($('pregunta-opciones'), boton);
        $('confianza').disabled = false;
        actualizarComprobar();
      });
      return boton;
    }),
  );
  $('confianza').disabled = true;
  $('confianza')
    .querySelectorAll('button')
    .forEach((b) => b.setAttribute('aria-checked', 'false'));
  $('pista').hidden = true;
  $('retroalimentacion').hidden = true;
  $('boton-pista').hidden = !pista;
  $('boton-comprobar').hidden = false;
  $('boton-comprobar').disabled = true;
  $('boton-siguiente').hidden = true;
  $('tarjeta-pregunta').hidden = false;
}

function mostrarRetroalimentacion(resultado) {
  const caja = $('retroalimentacion');
  caja.className = `grid gap-1 border p-4 text-[15px] ${
    resultado.correcta ? 'border-ok bg-ok-suave' : 'border-mal bg-mal-suave'
  }`;
  const titulo = document.createElement('p');
  titulo.className = `font-semibold ${resultado.correcta ? 'text-ok' : 'text-mal'}`;
  titulo.textContent = resultado.correcta ? 'Correcto' : 'No es correcto';
  const explicacion = document.createElement('p');
  explicacion.textContent = resultado.explicacion;
  const fuente = document.createElement('p');
  fuente.className = 'text-sm text-tinta-3';
  fuente.textContent = `Fuente: ${resultado.fuente}`;
  caja.replaceChildren(titulo, explicacion, fuente);
  caja.hidden = false;

  $('pregunta-opciones')
    .querySelectorAll('button')
    .forEach((b) => {
      b.setAttribute('disabled', '');
      if (b.dataset.id === resultado.correctaId) {
        b.classList.add('!border-ok', '!bg-ok-suave', '!shadow-[inset_0_0_0_1px_#2f7d43]');
      }
    });
  $('confianza').disabled = true;
  $('boton-comprobar').hidden = true;
  $('boton-pista').hidden = true;
  $('boton-siguiente').hidden = false;
  $('boton-siguiente').textContent =
    estado.indice + 1 < estado.datos.preguntas.length ? 'Siguiente pregunta' : 'Ver resultado';
  $('boton-siguiente').focus();
}

function mostrarResumen(dominio) {
  $('tarjeta-pregunta').hidden = true;
  $('resumen-titulo').textContent = `${estado.aciertos} de ${estado.datos.preguntas.length} correctas`;
  $('resumen-texto').textContent =
    `Dominio estimado: ${Math.round(dominio.despues * 100)} % (${ESTADO[dominio.estado]}). ${
      dominio.estado === 'dominada'
        ? 'Esta competencia sale de tu ruta; volverá como repaso para comprobar que la conservas.'
        : 'Sigue en tu ruta: la próxima vez tendrás menos ayuda conforme avances.'
    }`;
  $('resumen').hidden = false;
}

let ultimoDominio = null;

$('confianza')
  .querySelectorAll('button')
  .forEach((boton) => {
    boton.setAttribute('class', `${CLASE_OPCION} justify-center font-semibold`);
    boton.setAttribute('role', 'radio');
    boton.setAttribute('aria-checked', 'false');
    boton.addEventListener('click', () => {
      estado.confianza = Number(boton.dataset.valor);
      marcar($('confianza'), boton);
      actualizarComprobar();
    });
  });

$('boton-pista').addEventListener('click', () => {
  estado.pista = true;
  $('pista').textContent = `Pista: ${estado.datos.pista}`;
  $('pista').hidden = false;
  $('boton-pista').hidden = true;
});

$('boton-comprobar').addEventListener('click', async () => {
  $('boton-comprobar').disabled = true;
  try {
    const pregunta = estado.datos.preguntas[estado.indice];
    const resultado = await pedir(`/api/tecnicos/${tecnicoId}/practica/respuestas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preguntaId: pregunta.id,
        opcion: estado.opcion,
        confianza: estado.confianza,
        pista: estado.pista,
        ms: performance.now() - estado.inicio,
        inputDevice: 'mouse',
      }),
    });
    if (resultado.correcta) estado.aciertos += 1;
    ultimoDominio = resultado.dominio;
    mostrarDominio(resultado.dominio.despues, resultado.dominio.modo);
    mostrarRetroalimentacion(resultado);
  } catch (error) {
    mostrarError(error.message);
    actualizarComprobar();
  }
});

$('boton-siguiente').addEventListener('click', () => {
  estado.indice += 1;
  if (estado.indice < estado.datos.preguntas.length) mostrarPregunta();
  else mostrarResumen(ultimoDominio);
});

$('boton-empezar').addEventListener('click', () => {
  $('leccion').hidden = true;
  mostrarPregunta();
});

pedir(`/api/tecnicos/${tecnicoId}/practica/${competenciaId}`)
  .then((datos) => {
    estado.datos = datos;
    const { competencia, leccion } = datos;
    $('titulo-competencia').textContent = competencia.nombre;
    $('detalle-competencia').textContent =
      `Grupo ${competencia.grupo} · ${TECNOLOGIA[competencia.tecnologia]} · Nivel ${competencia.nivel}${
        competencia.critica ? ' · Seguridad crítica' : ''
      }`;
    mostrarDominio(datos.pSaber, datos.modo);
    if (leccion) {
      $('leccion-titulo').textContent = leccion.titulo;
      $('leccion-puntos').replaceChildren(
        ...leccion.puntos.map((texto, indice) => {
          const li = document.createElement('li');
          li.className = 'flex items-start gap-3 text-[17px] leading-relaxed';
          const numero = document.createElement('span');
          numero.className = 'recuadro mt-0.5';
          numero.textContent = indice + 1;
          const contenido = document.createElement('span');
          contenido.textContent = texto;
          li.append(numero, contenido);
          return li;
        }),
      );
      $('leccion-fuente').textContent = `Fuente: ${leccion.fuente}`;
      // Lecciones del sistema de tracción de 600 V: marco y marca naranja de alto voltaje.
      if (competencia.tecnologia === 'electrica' && competencia.grupo === 3) {
        $('leccion').classList.replace('border-tinta', 'border-hv');
        $('leccion-hv').hidden = false;
      }
      $('leccion').hidden = false;
    } else {
      mostrarPregunta();
    }
  })
  .catch((error) => mostrarError(error.message));
