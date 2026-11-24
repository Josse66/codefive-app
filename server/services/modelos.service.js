import fs from 'node:fs';
import path from 'node:path';
import db from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';

// Catálogo de modelos de autobús Volvo. El técnico elige el que atiende y la app le muestra solo
// el contenido que aplica a ese autobús: un eléctrico no ve postratamiento diésel y un diésel no
// ve alto voltaje. Los híbridos ven los dos.

const modelos = JSON.parse(fs.readFileSync(path.resolve('data', 'modelos.json'), 'utf8'));
const porId = new Map(modelos.map((m) => [m.id, m]));

export const listarModelos = () => modelos;
export const obtenerModelo = (id) => porId.get(id) ?? null;

/** El modelo del técnico; si aún no elige, uno de su tecnología para no dejarlo sin contenido. */
export function modeloDelTecnico(tecnico) {
  return porId.get(tecnico.modelo_id) ?? porId.get(tecnico.tecnologia === 'electrica' ? 'luminus' : '9800');
}

/** Si un contenido de cierta tecnología (diesel, electrica, ambas) aplica al modelo. */
export function aplicaAlModelo(tecnologiaContenido, modelo) {
  if (tecnologiaContenido === 'ambas' || modelo.tecnologia === 'hibrida') return true;
  return tecnologiaContenido === modelo.tecnologia;
}

export function elegirModelo(tecnicoId, modeloId) {
  const modelo = porId.get(modeloId);
  if (!modelo) throw errorHttp(400, 'Elige un modelo de autobús del catálogo');
  // La tecnología del técnico sigue al autobús que atiende (el híbrido cuenta como diésel).
  const tecnologia = modelo.tecnologia === 'electrica' ? 'electrica' : 'diesel';
  db.prepare('UPDATE tecnicos SET modelo_id = ?, tecnologia = ? WHERE id = ?').run(
    modelo.id,
    tecnologia,
    tecnicoId,
  );
  return modelo;
}
