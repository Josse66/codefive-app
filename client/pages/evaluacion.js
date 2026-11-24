// Evaluación de una competencia en tres momentos: antes de practicar, justo después y diferida
// (después de simular días sin practicar). Sin pistas ni retroalimentación hasta terminar.
const raiz = document.getElementById('evaluacion');
const { tecnicoId, competenciaId } = raiz.dataset;
const $ = (id) => document.getElementById(id);
const api = `/api/tecnicos/${tecnicoId}/evaluacion/${competenciaId}`;

const TECNOLOGIA = { diesel: 'Diésel', electrica: 'Eléctrico', ambas: 'Diésel y eléctrico' };
const TITULO_MOMENTO = { pre: 'Antes', post: 'Después', diferida: 'Diferida' };
const CLASE_OPCION =
  'flex w-full items-start gap-3 border border-placa-linea bg-white p-4 text-left text-[16px] transition-colors duration-150 hover:border-tinta aria-checked:border-tinta aria-checked:bg-placa-2 aria-checked:shadow-[inset_0_0_0_1px_#141c24]';
const CLASE_LETRA = 'codigo flex h-6 w-6 shrink-0 items-center justify-center border border-tinta text-sm';
const LETRAS = 'ABCD';

const estado = { datos: null, indice: 0, opcion: null, confianza: null, inicio: 0, respuestas: [] };

async function pedir(url, opciones) {
  const respuesta = await fetch(url, opciones);
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error ?? 'Algo salió mal');
  return datos;
}

const enviar = (url, cuerpo) =>
  pedir(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

function mostrarError(mensaje) {
  $('mensaje-error').textContent = mensaje;
  $('mensaje-error').hidden = false;
}

const porcentaje = (p) => Math.round(p * 100);

// ---------- Los tres momentos a la misma escala ----------

function pintarMomentos(datos) {
  const { momentos, siguiente, diasDiferida, diasDesdePost } = datos;
  raiz.querySelectorAll('[data-momento]').forEach((tarjeta) => {
    const clave = tarjeta.dataset.momento;
    const momento = momentos[clave];
    const q = (nombre) => tarjeta.querySelector(`[data-${nombre}]`);
    q('titulo').textContent = TITULO_MOMENTO[clave];
    if (clave === 'pre') q('cuando').textContent = 'antes de practicar';
    if (clave === 'post') q('cuando').textContent = 'al terminar la práctica';
    if (clave === 'diferida') q('cuando').textContent = `+${diasDiferida} días sin practicar`;

    const actual = siguiente === clave;
    tarjeta.classList.toggle('bg-placa-2', actual);
    if (actual) tarjeta.setAttribute('aria-current', 'step');
    else tarjeta.removeAttribute('aria-current');

    if (momento) {
      q('porcentaje').textContent = `${porcentaje(momento.pSaber)} %`;
      q('aciertos').textContent = `${momento.aciertos} de ${momento.total} correctas`;
      q('barra').style.width = `${porcentaje(momento.pSaber)}%`;
      q('nota').textContent = `Dominio estimado · día ${momento.dia}`;
    } else {
      q('porcentaje').textContent = '—';
      q('aciertos').textContent = actual ? 'toca ahora' : 'pendiente';
      q('barra').style.width = '0%';
      let nota = '';
      if (clave === 'diferida' && diasDesdePost != null) {
        nota = `Se abre al día ${diasDiferida}; van ${diasDesdePost}.`;
      } else if (clave === 'post' && siguiente === 'practica') {
        nota = 'Primero la práctica.';
      }
      q('nota').textContent = nota;
    }
  });
}

// ---------- Curva de olvido (SVG, sin librerías) ----------

const SVG = 'http://www.w3.org/2000/svg';
function nodo(tipo, atributos, texto) {
  const elemento = document.createElementNS(SVG, tipo);
  Object.entries(atributos).forEach(([k, v]) => elemento.setAttribute(k, v));
  if (texto != null) elemento.textContent = texto;
  return elemento;
}

function pintarCurva(datos) {
  const { curva, momentos } = datos;
  const contenedor = $('olvido-grafica');
  if (!curva) {
    const vacio = document.createElement('p');
    vacio.className = 'border border-dashed border-placa-linea p-4 text-sm text-tinta-3';
    vacio.textContent =
      'Aparece al terminar la evaluación de después: muestra cuánto se espera que conserve día por día.';
    contenedor.replaceChildren(vacio);
    return;
  }

  const ancho = 360;
  const alto = 220;
  const m = { izq: 34, der: 10, arr: 10, aba: 28 };
  const x = (dia) => m.izq + (dia / curva.dias) * (ancho - m.izq - m.der);
  const y = (p) => m.arr + (1 - p) * (alto - m.arr - m.aba);
  const svg = nodo('svg', {
    viewBox: `0 0 ${ancho} ${alto}`,
    class: 'w-full',
    role: 'img',
    'aria-label': `Curva de olvido de ${curva.dias} días`,
  });

  // Rejilla: umbrales del modelo (40 % y 80 %) y ejes.
  [0, 0.4, 0.8, 1].forEach((p) => {
    svg.append(
      nodo('line', {
        x1: m.izq,
        x2: ancho - m.der,
        y1: y(p),
        y2: y(p),
        stroke: p === 0 ? '#141c24' : '#c9d1d8',
      }),
      nodo(
        'text',
        { x: m.izq - 6, y: y(p) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#55616c' },
        `${p * 100}`,
      ),
    );
  });
  [0, 7, 14, 21]
    .filter((d) => d <= curva.dias)
    .forEach((d) => {
      svg.append(
        nodo('line', { x1: x(d), x2: x(d), y1: y(0), y2: y(0) + 4, stroke: '#141c24' }),
        nodo(
          'text',
          {
            x: x(d),
            y: alto - 10,
            // La última etiqueta se alinea a la derecha para que no se corte en el borde.
            'text-anchor': d === curva.dias ? 'end' : 'middle',
            'font-size': 10,
            fill: '#55616c',
          },
          `día ${d}`,
        ),
      );
    });

  // Punto de partida: hacia donde regresa lo que se olvida.
  svg.append(
    nodo('line', {
      x1: m.izq,
      x2: ancho - m.der,
      y1: y(curva.partida),
      y2: y(curva.partida),
      stroke: '#55616c',
      'stroke-dasharray': '4 4',
    }),
    nodo(
      'text',
      { x: ancho - m.der, y: y(curva.partida) - 5, 'text-anchor': 'end', 'font-size': 10, fill: '#55616c' },
      'antes de practicar',
    ),
  );

  const trazo = (puntos, atributos) =>
    nodo('polyline', {
      points: puntos.map((pt) => `${x(pt.dia).toFixed(1)},${y(pt.p).toFixed(1)}`).join(' '),
      fill: 'none',
      'stroke-width': 2.5,
      'stroke-linejoin': 'round',
      ...atributos,
    });
  // Tramo tras practicar; si ya hubo revisión diferida, el tramo tras el repaso arranca ahí.
  svg.append(trazo(curva.trasPractica, { stroke: '#141c24' }));
  if (curva.trasRepaso) svg.append(trazo(curva.trasRepaso, { stroke: '#2f7d43' }));

  // Mediciones reales sobre la curva.
  const punto = (dia, p, etiqueta) => {
    svg.append(
      nodo('rect', {
        x: x(dia) - 4,
        y: y(p) - 4,
        width: 8,
        height: 8,
        fill: '#ffffff',
        stroke: '#141c24',
        'stroke-width': 2,
      }),
      nodo(
        'text',
        { x: x(dia) + 8, y: y(p) - 6, 'font-size': 11, 'font-weight': 700, fill: '#141c24' },
        etiqueta,
      ),
    );
  };
  punto(0, momentos.post.pSaber, `después ${porcentaje(momentos.post.pSaber)}`);
  if (momentos.diferida) {
    const dia = momentos.diferida.dia - momentos.post.dia;
    punto(dia, momentos.diferida.pSaber, `diferida ${porcentaje(momentos.diferida.pSaber)}`);
  } else if (datos.diasDesdePost > 0) {
    const hoy = Math.min(datos.diasDesdePost, curva.dias);
    svg.append(
      nodo('line', {
        x1: x(hoy),
        x2: x(hoy),
        y1: y(1),
        y2: y(0),
        stroke: '#141c24',
        'stroke-dasharray': '2 3',
      }),
      nodo(
        'text',
        { x: x(hoy) - 4, y: y(1) + 10, 'text-anchor': 'end', 'font-size': 10, fill: '#141c24' },
        'hoy',
      ),
    );
  }

  const leyenda = document.createElement('p');
  leyenda.className = 'mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-2';
  const muestra = (clase, texto) => {
    const item = document.createElement('span');
    item.className = 'flex items-center gap-1.5';
    const linea = document.createElement('span');
    linea.className = `h-0.5 w-4 ${clase}`;
    item.append(linea, texto);
    return item;
  };
  leyenda.append(muestra('bg-tinta', 'tras practicar'));
  if (curva.trasRepaso) leyenda.append(muestra('bg-ok', 'tras el repaso'));
  contenedor.replaceChildren(svg, leyenda);
}

function pintarIndicadores(datos) {
  const { indicadores, momentos } = datos;
  $('ind-ganancia').textContent =
    indicadores.ganancia == null ? '—' : `${indicadores.ganancia > 0 ? '+' : ''}${indicadores.ganancia}`;
  $('ind-retencion').textContent = indicadores.retencion == null ? '—' : `${indicadores.retencion} %`;
  const ultimo = momentos.diferida ?? momentos.post;
  $('ind-estabilidad').textContent = ultimo ? `${ultimo.estabilidad} d` : '—';
}

// ---------- Qué toca ahora ----------

const esAltoVoltaje = (c) => c.tecnologia === 'electrica' && c.grupo === 3;

const ACCIONES = {
  pre: {
    titulo: 'Antes de practicar',
    texto: () =>
      'Dos preguntas sin ayuda para saber de dónde partes. No cuentan como calificación: sirven para medir cuánto aprendes con la práctica.',
    boton: 'Empezar evaluación',
  },
  practica: {
    titulo: 'Ahora practica',
    texto: () =>
      'Ya sabemos de dónde partes. Estudia la lección y practícala: preguntas con explicación o el escenario en el autobús. Al terminar regresas aquí para la evaluación de después.',
    enlace: 'Ir a la lección',
  },
  post: {
    titulo: 'Evaluación de después',
    texto: () =>
      'Las mismas dos preguntas del principio, ahora después de practicar. La diferencia es lo que aprendiste.',
    boton: 'Empezar evaluación',
  },
  esperar: {
    titulo: 'Revisión diferida',
    texto: (d) =>
      `Lo importante es si lo recuerdas después de unos días sin practicar. La revisión se abre al día ${d.diasDiferida} después de la práctica; van ${d.diasDesdePost}. En la demostración adelantamos el reloj del técnico.`,
    boton: (d) => `Simular +${d.diasDiferida - d.diasDesdePost} días`,
  },
  diferida: {
    titulo: 'Revisión diferida',
    texto: (d) =>
      `Pasaron ${d.diasDesdePost} días sin practicar. Dos preguntas de la práctica, en otro orden y sin pistas ni lección. El modelo ya descontó lo que se espera que hayas olvidado.`,
    boton: 'Empezar revisión',
  },
  completa: {
    titulo: 'Evaluación completa',
    texto: (d) =>
      d.indicadores.retencion >= 80
        ? `Conservó ${d.indicadores.retencion} % de lo aprendido. El repaso alargó la estabilidad: el siguiente repaso puede esperar más días.`
        : `Conservó ${d.indicadores.retencion} % de lo aprendido. La competencia regresa a su ruta para reforzarla.`,
    enlace: 'Practicar de nuevo',
  },
};

function pintarAccion(datos) {
  const accion = ACCIONES[datos.siguiente];
  const valor = (v) => (typeof v === 'function' ? v(datos) : v);
  $('accion-titulo').textContent = accion.titulo;
  $('accion-texto').textContent = accion.texto(datos);
  $('boton-accion').hidden = !accion.boton;
  if (accion.boton) $('boton-accion').textContent = valor(accion.boton);
  $('enlace-accion').hidden = !accion.enlace;
  if (accion.enlace) {
    $('enlace-accion').textContent = accion.enlace;
    // Antes de la evaluación de después se estudia; al terminar la evaluación se vuelve a practicar.
    $('enlace-accion').href =
      estado.datos.siguiente === 'practica'
        ? `/tecnicos/${tecnicoId}/aprender/L-${competenciaId}`
        : `/tecnicos/${tecnicoId}/practica/${competenciaId}`;
  }
  $('enlace-secundario').hidden = datos.siguiente !== 'completa';
  $('accion').classList.toggle('border-hv', esAltoVoltaje(datos.competencia));
  $('accion').classList.toggle('border-tinta', !esAltoVoltaje(datos.competencia));
  $('accion').hidden = false;
}

function pintar(datos) {
  estado.datos = datos;
  const { competencia, tecnico } = datos;
  $('titulo-competencia').textContent = competencia.nombre;
  $('detalle-competencia').textContent =
    `Grupo ${competencia.grupo} · ${TECNOLOGIA[competencia.tecnologia]} · Nivel ${
      competencia.nivel
    }${competencia.critica ? ' · Seguridad crítica' : ''}${
      esAltoVoltaje(competencia) ? ' · Alto voltaje 600 V, solo personal autorizado' : ''
    }`;
  $('dia-simulado').textContent = `día ${tecnico.diasSimulados}`;
  pintarMomentos(datos);
  pintarCurva(datos);
  pintarIndicadores(datos);
  pintarAccion(datos);
}

// ---------- Preguntas ----------

function marcar(contenedor, seleccionado) {
  contenedor
    .querySelectorAll('[aria-checked]')
    .forEach((b) => b.setAttribute('aria-checked', String(b === seleccionado)));
}

function actualizarSiguiente() {
  $('boton-siguiente').disabled = !(estado.opcion && estado.confianza);
}

function mostrarPregunta() {
  const { preguntas } = estado.datos;
  const pregunta = preguntas[estado.indice];
  Object.assign(estado, { opcion: null, confianza: null, inicio: performance.now() });

  $('pregunta-numero').textContent =
    `${TITULO_MOMENTO[estado.datos.siguiente]} · pregunta ${estado.indice + 1} de ${preguntas.length}`;
  $('pregunta-enunciado').textContent = pregunta.enunciado;
  // La letra se pone por posición: en la diferida las opciones cambian de orden.
  $('pregunta-opciones').replaceChildren(
    ...pregunta.opciones.map((opcion, posicion) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = CLASE_OPCION;
      boton.setAttribute('role', 'radio');
      boton.setAttribute('aria-checked', 'false');
      const letra = document.createElement('span');
      letra.className = CLASE_LETRA;
      letra.textContent = LETRAS[posicion];
      const texto = document.createElement('span');
      texto.textContent = opcion.texto;
      boton.append(letra, texto);
      boton.addEventListener('click', () => {
        estado.opcion = opcion.id;
        marcar($('pregunta-opciones'), boton);
        $('confianza').disabled = false;
        actualizarSiguiente();
      });
      return boton;
    }),
  );
  $('confianza').disabled = true;
  $('confianza')
    .querySelectorAll('button')
    .forEach((b) => b.setAttribute('aria-checked', 'false'));
  $('boton-siguiente').textContent =
    estado.indice + 1 < preguntas.length ? 'Siguiente' : 'Terminar y calificar';
  $('boton-siguiente').disabled = true;
  $('tarjeta-pregunta').hidden = false;
}

function mostrarResultado({ momento, detalle }) {
  const aciertos = detalle.filter((d) => d.correcta).length;
  $('resultado-titulo').textContent =
    `${TITULO_MOMENTO[momento]}: ${aciertos} de ${detalle.length} correctas`;
  $('resultado-detalle').replaceChildren(
    ...detalle.map((d) => {
      const li = document.createElement('li');
      li.className = `grid gap-1 border p-4 text-[15px] ${d.correcta ? 'border-ok bg-ok-suave' : 'border-mal bg-mal-suave'}`;
      const titulo = document.createElement('p');
      titulo.className = 'font-semibold';
      titulo.textContent = d.enunciado;
      const veredicto = document.createElement('p');
      veredicto.className = `font-semibold ${d.correcta ? 'text-ok' : 'text-mal'}`;
      veredicto.textContent = d.correcta ? 'Correcto' : 'No es correcto';
      const explicacion = document.createElement('p');
      explicacion.textContent = d.explicacion;
      const fuente = document.createElement('p');
      fuente.className = 'text-sm text-tinta-3';
      fuente.textContent = `Fuente: ${d.fuente}`;
      li.append(titulo, veredicto, explicacion, fuente);
      return li;
    }),
  );
  $('resultado').hidden = false;
}

$('confianza')
  .querySelectorAll('button')
  .forEach((boton) => {
    boton.setAttribute('class', `${CLASE_OPCION} justify-center font-semibold`);
    boton.setAttribute('role', 'radio');
    boton.setAttribute('aria-checked', 'false');
    boton.addEventListener('click', () => {
      estado.confianza = Number(boton.dataset.valor);
      marcar($('confianza'), boton);
      actualizarSiguiente();
    });
  });

$('boton-accion').addEventListener('click', async () => {
  $('mensaje-error').hidden = true;
  if (estado.datos.siguiente === 'esperar') {
    $('boton-accion').disabled = true;
    try {
      const { diasDiferida, diasDesdePost } = estado.datos;
      await enviar(`/api/tecnicos/${tecnicoId}/simular-dias`, { dias: diasDiferida - diasDesdePost });
      pintar(await pedir(api));
    } catch (error) {
      mostrarError(error.message);
    } finally {
      $('boton-accion').disabled = false;
    }
    return;
  }
  Object.assign(estado, { indice: 0, respuestas: [] });
  $('accion').hidden = true;
  $('resultado').hidden = true;
  mostrarPregunta();
});

$('boton-siguiente').addEventListener('click', async () => {
  const pregunta = estado.datos.preguntas[estado.indice];
  estado.respuestas.push({
    preguntaId: pregunta.id,
    opcion: estado.opcion,
    confianza: estado.confianza,
    ms: Math.round(performance.now() - estado.inicio),
    inputDevice: 'mouse',
  });
  estado.indice += 1;
  if (estado.indice < estado.datos.preguntas.length) {
    mostrarPregunta();
    return;
  }

  $('boton-siguiente').disabled = true;
  try {
    const { resultado, evaluacion } = await enviar(api, {
      momento: estado.datos.siguiente,
      respuestas: estado.respuestas,
    });
    $('tarjeta-pregunta').hidden = true;
    pintar(evaluacion);
    mostrarResultado(resultado);
  } catch (error) {
    // Se deshace la última respuesta para poder reintentar el envío.
    estado.respuestas.pop();
    estado.indice -= 1;
    mostrarError(error.message);
    $('boton-siguiente').disabled = false;
  }
});

pedir(api)
  .then(pintar)
  .catch((error) => mostrarError(error.message));
