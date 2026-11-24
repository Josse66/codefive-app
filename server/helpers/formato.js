// Helpers de Handlebars para mostrar el modelo en lenguaje de taller.

const TECNOLOGIAS = { diesel: 'Diésel', electrica: 'Eléctrico', ambas: 'Diésel y eléctrico' };
const ESTADOS = { dominada: 'Dominada', en_desarrollo: 'En desarrollo', brecha: 'Brecha' };
const CLASES_ESTADO = {
  dominada: 'border-green-600 bg-green-50 text-green-900',
  en_desarrollo: 'border-amber-500 bg-amber-50 text-amber-900',
  brecha: 'border-red-600 bg-red-50 text-red-900',
};
const HABILIDADES = {
  comprension: 'Comprensión',
  diagnostico: 'Diagnóstico',
  mantenimiento: 'Mantenimiento',
  reparacion: 'Reparación',
  seguridad: 'Seguridad',
};

export const porcentaje = (p) => Math.round(Number(p) * 100);
export const nombreTecnologia = (t) => TECNOLOGIAS[t] ?? t;
export const nombreEstado = (e) => ESTADOS[e] ?? e;
export const claseEstado = (e) => CLASES_ESTADO[e] ?? '';
export const nombreHabilidad = (h) => HABILIDADES[h] ?? h;

const MODOS = { guiado: 'Guiado', con_pistas: 'Con pistas', autonomo: 'Autónomo' };
export const nombreModo = (m) => MODOS[m] ?? m;
