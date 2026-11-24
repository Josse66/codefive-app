import fs from 'node:fs';
import path from 'node:path';

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
// Grupos de función de Volvo (Impact), con los nombres que usan los técnicos: data/grupos.json.
const GRUPOS = JSON.parse(fs.readFileSync(path.resolve('data', 'grupos.json'), 'utf8'));
const MODOS = { guiado: 'Guiado', con_pistas: 'Con pistas', autonomo: 'Autónomo' };

export const porcentaje = (p) => Math.round(Number(p) * 100);
// Parte de un total, en por ciento entero (0 si el total es 0).
export const proporcion = (parte, total) =>
  Number(total) ? Math.round((Number(parte) / Number(total)) * 100) : 0;
export const nombreTecnologia = (t) => TECNOLOGIAS[t] ?? t;
export const nombreEstado = (e) => ESTADOS[e] ?? e;
export const claseEstado = (e) => CLASES_ESTADO[e] ?? '';
export const rellenoEstado = (e) => RELLENO_ESTADO[e] ?? RELLENO_ESTADO.sin_evaluar;
export const nombreHabilidad = (h) => HABILIDADES[h] ?? h;
export const nombreGrupo = (g) => GRUPOS[g]?.nombre ?? `Grupo ${g}`;
export const descripcionGrupo = (g) => GRUPOS[g]?.descripcion ?? '';
export const nombreModo = (m) => MODOS[m] ?? m;

// Competencias del sistema de tracción de 600 V: llevan la marca naranja de alto voltaje.
export const altoVoltaje = (tecnologia, grupo) => tecnologia === 'electrica' && Number(grupo) === 3;
