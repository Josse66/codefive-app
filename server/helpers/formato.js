// Helpers de Handlebars para mostrar el modelo en lenguaje de taller.

const TECNOLOGIAS = { diesel: 'Diésel', electrica: 'Eléctrico', ambas: 'Diésel y eléctrico' };
const ESTADOS = {
  dominada: 'Dominada',
  en_desarrollo: 'En desarrollo',
  brecha: 'Brecha',
  sin_evaluar: 'Sin evaluar',
};
const CLASES_ESTADO = {
  dominada: 'border-ok bg-ok-suave text-ok',
  en_desarrollo: 'border-med bg-med-suave text-med-texto',
  brecha: 'border-mal bg-mal-suave text-mal',
  sin_evaluar: 'border-nada bg-nada-suave text-tinta-3',
};
// Relleno del recuadro de referencia en la lámina del autobús.
const RELLENO_ESTADO = {
  dominada: '#2f7d43',
  en_desarrollo: '#c98a00',
  brecha: '#b3121f',
  sin_evaluar: '#8a959f',
};
const HABILIDADES = {
  comprension: 'Comprensión',
  diagnostico: 'Diagnóstico',
  mantenimiento: 'Mantenimiento',
  reparacion: 'Reparación',
  seguridad: 'Seguridad',
};
// Grupos de función de Volvo (Tech Tool / Impact).
const GRUPOS = {
  1: 'Servicio y mantenimiento',
  2: 'Motor y equipo asociado',
  3: 'Sistema eléctrico e instrumentos',
  4: 'Transmisión',
  5: 'Frenos',
  6: 'Ejes, suspensión y dirección',
  7: 'Bastidor, resortes y ruedas',
  8: 'Carrocería, cabina e interior',
  9: 'Misceláneos',
};
const MODOS = { guiado: 'Guiado', con_pistas: 'Con pistas', autonomo: 'Autónomo' };

export const porcentaje = (p) => Math.round(Number(p) * 100);
export const nombreTecnologia = (t) => TECNOLOGIAS[t] ?? t;
export const nombreEstado = (e) => ESTADOS[e] ?? e;
export const claseEstado = (e) => CLASES_ESTADO[e] ?? '';
export const rellenoEstado = (e) => RELLENO_ESTADO[e] ?? RELLENO_ESTADO.sin_evaluar;
export const nombreHabilidad = (h) => HABILIDADES[h] ?? h;
export const nombreGrupo = (g) => GRUPOS[g] ?? `Grupo ${g}`;
export const nombreModo = (m) => MODOS[m] ?? m;
