// Tablero de Volvo en vivo: pide el resumen a la API y lo vuelve a pedir cada vez que el servidor
// avisa por Socket.IO que un técnico respondió algo o adelantó su reloj.
import { io } from 'socket.io-client';
import { BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip } from 'chart.js';
import GRUPOS_DATOS from '../../data/grupos.json';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
Chart.defaults.font.family = 'Archivo, system-ui, sans-serif';
Chart.defaults.font.size = 13;
Chart.defaults.color = '#33404c';
Chart.defaults.borderColor = '#e3e8ec';

const $ = (id) => document.getElementById(id);
const COLOR = {
  tinta: '#141c24',
  tinta3: '#55616c',
  nada: '#8a959f',
  ok: '#2f7d43',
  med: '#c98a00',
  mal: '#b3121f',
};
const TECNOLOGIA = { diesel: 'Diésel', electrica: 'Eléctrico', ambas: 'Diésel y eléctrico' };

const INDICADORES = {
  diagnosticados: {
    etiqueta: 'Técnicos diagnosticados',
    valor: (i) => `${i.diagnosticados}/${i.tecnicos}`,
  },
  listos: {
    etiqueta: 'Listos para el autobús real',
    valor: (i) => `${i.listos}`,
    nota: (i) => `de ${i.diagnosticados} diagnosticados`,
  },
  dominioPromedio: {
    etiqueta: 'Dominio promedio',
    valor: (i) => (i.dominioPromedio == null ? '—' : `${i.dominioPromedio} %`),
  },
  gananciaPromedio: {
    etiqueta: 'Ganancia con la práctica',
    valor: (i) => (i.gananciaPromedio == null ? '—' : `+${i.gananciaPromedio}`),
    nota: () => 'puntos de dominio, antes a después',
  },
  retencionPromedio: {
    etiqueta: 'Retención a 7 días',
    valor: (i) => (i.retencionPromedio == null ? '—' : `${i.retencionPromedio} %`),
    nota: (i) => `${i.evaluacionesDiferidas} revisiones diferidas`,
  },
  alertasSeguridad: {
    etiqueta: 'Alertas de seguridad',
    valor: (i) => `${i.alertasSeguridad}`,
    nota: () => 'seguro y equivocado en críticas',
    critico: (i) => i.alertasSeguridad > 0,
  },
};

const el = (etiqueta, clase, texto) => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto != null) nodo.textContent = texto;
  return nodo;
};

const colorDominio = (p) => {
  if (p >= 80) return COLOR.ok;
  if (p >= 40) return COLOR.med;
  return COLOR.mal;
};

const hora = (fechaSql) =>
  new Date(`${fechaSql.replace(' ', 'T')}Z`).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

// ---------- Indicadores ----------

function pintarIndicadores(indicadores) {
  document.querySelectorAll('[data-indicador]').forEach((celda) => {
    const definicion = INDICADORES[celda.dataset.indicador];
    const [etiqueta, valor, nota] = ['etiqueta', 'valor', 'nota'].map((n) =>
      celda.querySelector(`[data-${n}]`),
    );
    etiqueta.textContent = definicion.etiqueta;
    valor.textContent = definicion.valor(indicadores);
    nota.textContent = definicion.nota?.(indicadores) ?? '';
    const critico = definicion.critico?.(indicadores) ?? false;
    celda.classList.toggle('bg-mal-suave', critico);
    valor.classList.toggle('text-mal', critico);
  });
}

// ---------- Técnicos ----------

function celdaPreparacion(tecnico) {
  const td = el('td');
  if (!tecnico.preparacion) {
    td.append(el('span', 'chip border-nada bg-nada-suave text-tinta-3', 'Sin diagnóstico'));
    return td;
  }
  if (tecnico.preparacion.listo) {
    td.append(el('span', 'chip border-ok bg-ok-suave text-ok', `Listo · ${TECNOLOGIA[tecnico.tecnologia]}`));
    return td;
  }
  const lista = el('div', 'flex flex-wrap gap-1');
  tecnico.preparacion.pendientes.forEach((p) => {
    const chip = el(
      'span',
      p.alerta ? 'chip border-mal bg-mal text-white' : 'chip border-mal bg-mal-suave text-mal',
      p.id,
    );
    chip.title = p.alerta ? `${p.nombre}: respondió seguro y se equivocó` : `${p.nombre}: sin dominar`;
    lista.append(chip);
  });
  td.append(el('span', 'mb-1 block text-xs text-tinta-3', 'Le falta:'), lista);
  return td;
}

function pintarTecnicos(tecnicos) {
  $('tabla-tecnicos').replaceChildren(
    ...tecnicos.map((t) => {
      const fila = el('tr');
      fila.dataset.tecnico = t.id;

      const nombre = el('td');
      const enlace = el(
        'a',
        'font-semibold underline decoration-placa-linea hover:decoration-tinta',
        t.nombre,
      );
      enlace.href = t.diagnosticado ? `/tecnicos/${t.id}/perfil` : `/tecnicos/${t.id}/diagnostico`;
      nombre.append(
        enlace,
        el('span', 'block text-xs text-tinta-3', `${TECNOLOGIA[t.tecnologia]} · ${t.aniosExperiencia} años`),
      );

      const dominadas = el('td');
      const barra = el('div', 'mt-1.5 h-1.5 w-28 bg-placa-2');
      const relleno = el('div', 'h-1.5 bg-tinta');
      relleno.style.width = `${(t.dominadas / t.total) * 100}%`;
      barra.append(relleno);
      dominadas.append(el('span', 'codigo', `${t.dominadas}/${t.total}`), barra);

      const retencion = el('td', 'codigo', t.retencion == null ? '—' : `${t.retencion} %`);
      const progreso = el('td', 'whitespace-nowrap');
      progreso.append(
        el('span', 'block font-semibold', t.progreso.nivel),
        el(
          'span',
          'text-xs text-tinta-3',
          `${t.progreso.entregadas} órdenes${t.progreso.reputacion == null ? '' : ` · ${t.progreso.reputacion} ★`}`,
        ),
      );
      const errores = el(
        'td',
        `codigo ${t.erroresCriticos ? 'text-mal' : 'text-tinta-3'}`,
        `${t.erroresCriticos}`,
      );

      fila.append(
        el('td', 'codigo whitespace-nowrap', t.id),
        nombre,
        el('td', 'whitespace-nowrap', t.taller),
        dominadas,
        el('td', 'codigo', t.dominioPromedio == null ? '—' : `${t.dominioPromedio} %`),
        retencion,
        progreso,
        errores,
        celdaPreparacion(t),
      );
      return fila;
    }),
  );
}

// ---------- Actividad ----------

let ultimoEventoVisto = null;

function pintarActividad(actividad) {
  if (!actividad.length) {
    $('actividad').replaceChildren(
      el(
        'li',
        'p-4 text-sm text-tinta-3',
        'Sin actividad todavía. Abre un diagnóstico en otra ventana y responde.',
      ),
    );
    return;
  }
  $('actividad').replaceChildren(
    ...actividad.map((e) => {
      const nuevo = ultimoEventoVisto != null && e.id > ultimoEventoVisto;
      const li = el(
        'li',
        `grid gap-0.5 border-b border-placa-linea px-4 py-2.5 text-sm last:border-b-0 transition-colors duration-1000 ${
          nuevo ? 'bg-placa-2' : ''
        }`,
      );
      const arriba = el('div', 'flex items-baseline justify-between gap-2');
      arriba.append(
        el('span', 'font-semibold', e.tecnico),
        el('span', 'text-xs text-tinta-3', hora(e.creadoEn)),
      );
      let resultado = e.correcta ? 'acertó' : 'falló';
      if (e.seguroEquivocado) resultado = 'seguro y equivocado';
      const clase = e.correcta ? 'text-ok' : 'text-mal';
      const abajo = el('p', 'text-tinta-2');
      abajo.append(
        el('span', 'codigo text-tinta', e.competenciaId ?? ''),
        ` · ${e.faseNombre} · `,
        el('span', `font-semibold ${clase}`, resultado),
      );
      li.append(arriba, abajo);
      if (nuevo) setTimeout(() => li.classList.remove('bg-placa-2'), 50);
      return li;
    }),
  );
  ultimoEventoVisto = actividad[0].id;
}

// ---------- Gráficas ----------

const ejePorcentaje = {
  min: 0,
  max: 100,
  ticks: { stepSize: 20, callback: (v) => `${v} %` },
};

let graficaDominio = null;
let graficaRetencion = null;

function pintarDominio(competencias) {
  const conDatos = competencias.filter((c) => c.promedio != null);
  const datos = {
    labels: conDatos.map((c) => c.id),
    datasets: [
      {
        label: 'Dominio promedio',
        data: conDatos.map((c) => c.promedio),
        backgroundColor: conDatos.map((c) => colorDominio(c.promedio)),
        borderRadius: 0,
        barThickness: 18,
      },
    ],
  };
  if (graficaDominio) {
    graficaDominio.data = datos;
    graficaDominio.update();
    return;
  }
  graficaDominio = new Chart($('grafica-dominio'), {
    type: 'bar',
    data: datos,
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      scales: {
        x: ejePorcentaje,
        y: {
          grid: { display: false },
          ticks: { font: { family: '"Archivo Narrow", Archivo', weight: 700 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const c = conDatos[items[0].dataIndex];
              return c ? `${c.id} · ${c.nombre}` : '';
            },
            label: (item) => {
              const c = conDatos[item.dataIndex];
              return `${item.raw} % · ${c.dominadas} dominan, ${c.brechas} con brecha`;
            },
          },
        },
      },
    },
  });
}

function pintarRetencion(retencion) {
  $('retencion-vacia').hidden = retencion.length > 0;
  const datos = {
    labels: retencion.map((r) => r.id),
    datasets: [
      { label: 'Antes', data: retencion.map((r) => r.pre), backgroundColor: COLOR.nada },
      { label: 'Después', data: retencion.map((r) => r.post), backgroundColor: COLOR.tinta },
      { label: 'Diferida (+7 días)', data: retencion.map((r) => r.diferida), backgroundColor: COLOR.ok },
    ],
  };
  if (graficaRetencion) {
    graficaRetencion.data = datos;
    graficaRetencion.update();
    return;
  }
  graficaRetencion = new Chart($('grafica-retencion'), {
    type: 'bar',
    data: datos,
    options: {
      maintainAspectRatio: false,
      datasets: { bar: { borderRadius: 0, maxBarThickness: 28 } },
      scales: {
        y: ejePorcentaje,
        x: {
          grid: { display: false },
          ticks: { font: { family: '"Archivo Narrow", Archivo', weight: 700 } },
        },
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, boxHeight: 14 } },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${item.raw == null ? 'sin medir' : `${item.raw} %`}`,
          },
        },
      },
    },
  });
}

// ---------- Mapa de calor ----------

const CLASE_CELDA = (p) => {
  if (p == null) return 'bg-placa text-tinta-3';
  if (p >= 80) return 'bg-ok text-white';
  if (p >= 40) return 'bg-med text-tinta';
  return 'bg-mal text-white';
};
const GRUPOS = Object.fromEntries(Object.entries(GRUPOS_DATOS).map(([n, g]) => [n, g.corto]));

function pintarMapa(mapa) {
  const encabezado = el('tr');
  encabezado.append(el('th', '', 'Técnico'));
  mapa.grupos.forEach((g) => {
    const th = el('th', 'text-center');
    th.append(el('span', 'recuadro h-6 w-6 text-sm', `${g}`), el('span', 'mt-1 block', GRUPOS[g]));
    encabezado.append(th);
  });
  $('mapa-encabezado').replaceChildren(encabezado);
  if (!mapa.filas.length) {
    const fila = el('tr');
    const celda = el('td', 'text-tinta-3', 'Sin técnicos con actividad todavía.');
    celda.colSpan = 10;
    fila.append(celda);
    $('mapa').replaceChildren(fila);
    return;
  }
  $('mapa').replaceChildren(
    ...mapa.filas.map((f) => {
      const fila = el('tr');
      const nombre = el('td', 'whitespace-nowrap');
      nombre.append(
        el('span', 'block font-semibold', f.nombre),
        el('span', 'text-xs text-tinta-3', f.taller),
      );
      fila.append(nombre);
      f.celdas.forEach((c) => {
        const td = el(
          'td',
          `codigo border border-white text-center transition-colors duration-700 ${CLASE_CELDA(c.p)}`,
          c.p == null ? '—' : `${c.p}`,
        );
        td.title = `${f.nombre} · grupo ${c.grupo}: ${c.p == null ? 'sin datos' : `${c.p} %`}`;
        fila.append(td);
      });
      return fila;
    }),
  );
}

// ---------- Errores del taller ----------

function pintarCodigos(errores) {
  if (!errores.length) {
    const fila = el('tr');
    const celda = el('td', 'text-tinta-3', 'Sin errores en las órdenes del taller.');
    celda.colSpan = 5;
    fila.append(celda);
    $('tabla-codigos').replaceChildren(fila);
    return;
  }
  $('tabla-codigos').replaceChildren(
    ...errores.map((e) => {
      const fila = el('tr');
      const codigo = el('td', 'whitespace-nowrap');
      codigo.append(
        el('span', `codigo block text-lg ${e.critico ? 'text-mal' : ''}`, e.codigo),
        el(
          'span',
          `chip ${e.critico ? 'border-mal bg-mal text-white' : 'border-tinta-3 text-tinta-2'}`,
          e.critico ? 'Crítico' : 'Error',
        ),
      );
      const que = el('td', 'max-w-[44ch]');
      que.append(
        el('span', 'block', e.mensaje),
        el('span', 'text-xs text-tinta-3', `Grupo ${e.grupo} · ${e.escenario}`),
      );
      fila.append(
        codigo,
        que,
        el('td', 'codigo', `${e.veces}`),
        el('td', 'codigo', `${e.tecnicos}`),
        el('td', 'text-sm', e.talleres.join(', ')),
      );
      return fila;
    }),
  );
}

function pintarTalleres(talleres) {
  $('tabla-talleres').replaceChildren(
    ...talleres.map((t) => {
      const fila = el('tr');
      fila.append(
        el('td', 'font-semibold', t.taller),
        el('td', 'codigo', `${t.tecnicos}`),
        el('td', 'codigo', t.tasaError == null ? '—' : `${t.tasaError} %`),
        el('td', `codigo ${t.criticos ? 'text-mal' : 'text-tinta-3'}`, `${t.criticos}`),
      );
      return fila;
    }),
  );
}

// ---------- Alerta de error crítico en vivo ----------

let ultimoDato = null;
let cierreAlerta = null;
function mostrarAlerta(aviso) {
  const tecnico = ultimoDato?.tecnicos.find((t) => t.id === aviso.tecnicoId);
  const error = ultimoDato?.erroresEscenarios.find((e) => e.codigo === aviso.codigoError);
  $('alerta-codigo').textContent = aviso.codigoError ?? aviso.competenciaId ?? 'Seguridad';
  $('alerta-quien').textContent = tecnico ? `${tecnico.nombre} · ${tecnico.taller}` : aviso.tecnicoId;
  $('alerta-mensaje').textContent =
    error?.mensaje ??
    (aviso.escenarioId
      ? 'Error crítico en una orden del taller.'
      : `Respondió mal una pregunta de seguridad crítica (${aviso.competenciaId}).`);
  $('alerta').hidden = false;
  clearTimeout(cierreAlerta);
  cierreAlerta = setTimeout(() => {
    $('alerta').hidden = true;
  }, 12000);
}
$('alerta-cerrar').addEventListener('click', () => {
  $('alerta').hidden = true;
});

// ---------- Errores recurrentes ----------

function pintarErrores(errores) {
  if (!errores.length) {
    const fila = el('tr');
    const celda = el('td', 'text-tinta-3', 'Todavía no hay respuestas falladas.');
    celda.colSpan = 5;
    fila.append(celda);
    $('tabla-errores').replaceChildren(fila);
    return;
  }
  $('tabla-errores').replaceChildren(
    ...errores.map((e) => {
      const fila = el('tr');
      const competencia = el('td');
      competencia.append(
        el('span', 'codigo block', e.competenciaId),
        el('span', 'text-xs text-tinta-3', e.competencia),
      );
      if (e.critica)
        competencia.append(el('span', 'chip mt-1 border-mal bg-mal-suave text-mal', 'Seguridad crítica'));
      fila.append(
        el('td', 'max-w-[46ch]', e.enunciado),
        competencia,
        el('td', 'codigo whitespace-nowrap', `${e.fallos} de ${e.intentos}`),
        el('td', `codigo ${e.segurosEquivocados ? 'text-mal' : 'text-tinta-3'}`, `${e.segurosEquivocados}`),
        el('td', 'codigo', `${e.tecnicos}`),
      );
      return fila;
    }),
  );
}

// ---------- Carga y tiempo real ----------

let ultimaActualizacion = null;

function marcarConexion(conectado) {
  $('punto-conexion').className = `h-2.5 w-2.5 ${conectado ? 'bg-ok' : 'bg-mal'}`;
  const cuando = ultimaActualizacion
    ? ` · actualizado ${ultimaActualizacion.toLocaleTimeString('es-MX')}`
    : '';
  $('texto-conexion').textContent = `${conectado ? 'En vivo' : 'Sin conexión'}${cuando}`;
}

const socket = io();

async function cargar() {
  try {
    const respuesta = await fetch('/api/tablero');
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error ?? 'No se pudo cargar el tablero');
    pintarIndicadores(datos.indicadores);
    pintarTecnicos(datos.tecnicos);
    pintarActividad(datos.actividad);
    pintarDominio(datos.competencias);
    pintarRetencion(datos.retencion);
    pintarErrores(datos.errores);
    pintarMapa(datos.mapa);
    pintarCodigos(datos.erroresEscenarios);
    pintarTalleres(datos.talleres);
    ultimoDato = datos;
    ultimaActualizacion = new Date();
    marcarConexion(socket.connected);
    $('mensaje-error').hidden = true;
  } catch (error) {
    $('mensaje-error').textContent = error.message;
    $('mensaje-error').hidden = false;
  }
}

// Una evaluación manda varios avisos seguidos: se espera un momento y se recarga una sola vez.
let pendiente = null;
function programarCarga() {
  clearTimeout(pendiente);
  pendiente = setTimeout(cargar, 300);
}

socket.on('connect', () => {
  marcarConexion(true);
  programarCarga();
});
socket.on('disconnect', () => marcarConexion(false));
socket.on('evento', (aviso) => {
  programarCarga();
  // La alerta espera a que lleguen los datos nuevos para poder decir qué pasó.
  if (aviso.critico) setTimeout(() => mostrarAlerta(aviso), 450);
});
socket.on('orden', programarCarga);
socket.on('reloj', programarCarga);

cargar();
