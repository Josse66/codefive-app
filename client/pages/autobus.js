// Explorar el autobús por grupos de función: recuadros 1 a 9 con el color del dominio del técnico
// y la ficha del escenario de práctica de cada grupo.
import { crearEscena } from '../escena/autobus3d.js';

const raiz = document.getElementById('autobus');
const { tecnicoId, autobus } = raiz.dataset;
const $ = (id) => document.getElementById(id);

const GRUPOS = {
  1: 'Servicio y mantenimiento',
  2: 'Motor y equipo asociado',
  3: 'Sistema eléctrico e instrumentos',
  4: 'Transmisión',
  5: 'Frenos',
  6: 'Suspensión y dirección',
  7: 'Bastidor, resortes y ruedas',
  8: 'Carrocería e interior',
  9: 'Misceláneos',
};
const COLOR = { dominada: '#2f7d43', en_desarrollo: '#c98a00', brecha: '#b3121f' };
const ESTADO = { dominada: 'Dominada', en_desarrollo: 'En desarrollo', brecha: 'Brecha' };
const CHIP = {
  dominada: 'border-ok bg-ok-suave text-ok',
  en_desarrollo: 'border-med bg-med-suave text-med-texto',
  brecha: 'border-mal bg-mal-suave text-mal',
};

let escenarios = [];

function seleccionar(grupo) {
  const e = escenarios.find((x) => x.grupo === grupo);
  if (!e) return;
  $('ficha-grupo').textContent = grupo;
  $('ficha-nombre').textContent = GRUPOS[grupo];
  $('ficha-titulo').textContent = e.titulo;
  $('ficha-sintoma').textContent = e.sintoma;
  $('ficha-competencia').textContent = e.competencia.id;
  $('ficha-estado').className = `chip ${CHIP[e.competencia.estado]}`;
  $('ficha-estado').textContent =
    `${Math.round(e.competencia.pSaber * 100)} % · ${ESTADO[e.competencia.estado]}`;
  $('ficha-profundidad').textContent =
    e.profundidad === 'completo' ? 'Escenario completo' : 'Escenario ligero';
  $('ficha-enlace').href = `/tecnicos/${tecnicoId}/escenario/${e.id}`;
  document.querySelectorAll('#lista-grupos button').forEach((b) => {
    b.setAttribute('aria-current', String(Number(b.dataset.grupo) === grupo));
  });
}

function pintarLista() {
  $('lista-grupos').replaceChildren(
    ...escenarios.map((e) => {
      const li = document.createElement('li');
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.dataset.grupo = e.grupo;
      boton.className =
        'flex w-full items-center gap-3 border-b border-placa-linea px-4 py-2.5 text-left text-[15px] hover:bg-placa aria-[current=true]:bg-placa-2';
      const numero = document.createElement('span');
      numero.className = 'recuadro h-6 w-6 text-sm';
      numero.style.background = COLOR[e.competencia.estado];
      numero.textContent = e.grupo;
      const texto = document.createElement('span');
      texto.className = 'flex-1';
      texto.textContent = GRUPOS[e.grupo];
      const porcentaje = document.createElement('span');
      porcentaje.className = 'codigo text-tinta-3';
      porcentaje.textContent = `${Math.round(e.competencia.pSaber * 100)} %`;
      boton.append(numero, texto, porcentaje);
      boton.addEventListener('click', () => seleccionar(e.grupo));
      li.append(boton);
      return li;
    }),
  );
}

fetch(`/api/tecnicos/${tecnicoId}/escenarios`)
  .then(async (respuesta) => {
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error ?? 'No se pudo cargar el autobús');
    escenarios = datos;
    const escena = crearEscena($('lienzo'), { autobus, grupos: true });
    escenarios.forEach((e) => escena.marcarGrupo(e.grupo, COLOR[e.competencia.estado]));
    escena.lienzo.addEventListener('click', (evento) => {
      const caja = escena.lienzo.getBoundingClientRect();
      const grupo = escena.grupoEn(
        (evento.clientX - caja.left) / caja.width,
        (evento.clientY - caja.top) / caja.height,
      );
      if (grupo) seleccionar(grupo);
    });
    pintarLista();
    // Abre el grupo que más urge: el de menor dominio.
    const urgente = [...escenarios].sort((a, b) => a.competencia.pSaber - b.competencia.pSaber)[0];
    seleccionar(urgente.grupo);
  })
  .catch((error) => {
    $('mensaje-error').textContent = error.message;
    $('mensaje-error').hidden = false;
  });
