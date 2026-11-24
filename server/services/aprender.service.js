import fs from 'node:fs';
import path from 'node:path';
import db from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';
import { nombreGrupo } from '#helpers/formato.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { asegurarDominio, obtenerPerfil } from '#services/dominio.service.js';
import { obtenerRuta } from '#services/ruta.service.js';
import { obtenerEscenario } from '#services/escenarios.js';

// Modo Aprender: el temario por grupo de función y nivel, una lección por competencia.
// Cada lección se apoya en el autobús 3D: sus piezas son las del escenario que la practica
// (o las suyas propias) y al hacer clic se ve qué es, cómo falla y cómo se revisa.

const temario = JSON.parse(fs.readFileSync(path.resolve('data', 'temario.json'), 'utf8'));
const porId = new Map(temario.map((l) => [l.id, l]));
const porCompetencia = new Map(temario.map((l) => [l.competencia, l]));

// Piezas de la lección con su posición en el autobús: del escenario o declaradas en la lección.
function piezasDe(leccion) {
  const escenario = leccion.escenario ? obtenerEscenario(leccion.escenario) : null;
  return leccion.piezas.map((p) => {
    const delEscenario = escenario?.piezas.find((e) => e.id === p.id);
    const pieza = { ...delEscenario, ...p };
    if (!pieza.pos) throw new Error(`La pieza ${p.id} de ${leccion.id} no tiene posición en el autobús`);
    return pieza;
  });
}
// Falla al arrancar si una lección apunta a una pieza que no existe.
temario.forEach(piezasDe);

function validarTecnico(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  asegurarDominio(tecnico);
  return tecnico;
}

const vistas = (tecnicoId) =>
  new Set(
    db
      .prepare('SELECT leccion_id FROM lecciones_vistas WHERE tecnico_id = ?')
      .all(tecnicoId)
      .map((f) => f.leccion_id),
  );

// La lección recomendada es la de la primera competencia de la ruta que tenga lección.
function recomendada(tecnicoId) {
  const { pasos } = obtenerRuta(tecnicoId);
  const paso = pasos.find((p) => porCompetencia.has(p.competencia.id));
  return paso ? { leccion: porCompetencia.get(paso.competencia.id).id, motivo: paso.motivo } : null;
}

export function obtenerTemario(tecnicoId) {
  const tecnico = validarTecnico(tecnicoId);
  const competencias = new Map(obtenerPerfil(tecnico.id).competencias.map((c) => [c.id, c]));
  const vistasTecnico = vistas(tecnico.id);
  const sugerida = recomendada(tecnico.id);

  const grupos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((grupo) => ({
    grupo,
    nombre: nombreGrupo(grupo),
    lecciones: temario
      .filter((l) => competencias.get(l.competencia)?.grupo === grupo)
      .map((l) => {
        const c = competencias.get(l.competencia);
        return {
          id: l.id,
          titulo: l.titulo,
          minutos: l.minutos,
          nivel: c.nivel,
          tecnologia: c.tecnologia,
          critica: c.critica,
          competencia: { id: c.id, pSaber: c.pSaber, estado: c.estado },
          vista: vistasTecnico.has(l.id),
          recomendada: sugerida?.leccion === l.id,
        };
      })
      .sort((a, b) => a.nivel - b.nivel),
  }));

  return {
    tecnico: { id: tecnico.id, nombre: tecnico.nombre },
    recomendada: sugerida ? { ...sugerida, titulo: porId.get(sugerida.leccion).titulo } : null,
    avance: { vistas: vistasTecnico.size, total: temario.length },
    grupos,
  };
}

export function obtenerLeccion(tecnicoId, leccionId) {
  const tecnico = validarTecnico(tecnicoId);
  const leccion = porId.get(leccionId);
  if (!leccion) throw errorHttp(404, 'Lección no encontrada');
  const competencia = obtenerPerfil(tecnico.id).competencias.find((c) => c.id === leccion.competencia);
  const escenario = leccion.escenario ? obtenerEscenario(leccion.escenario) : null;
  const autobus =
    escenario?.autobus ??
    (competencia.tecnologia === 'electrica' ||
    (competencia.tecnologia === 'ambas' && tecnico.tecnologia === 'electrica')
      ? 'electrico'
      : 'diesel');

  // Siguiente lección: la que sigue en el temario.
  const indice = temario.indexOf(leccion);
  const siguiente = temario[indice + 1] ?? null;

  return {
    tecnico: { id: tecnico.id, nombre: tecnico.nombre },
    leccion: { ...leccion, piezas: piezasDe(leccion) },
    competencia,
    grupo: { numero: competencia.grupo, nombre: nombreGrupo(competencia.grupo) },
    autobus,
    enfoque: escenario?.enfoque ?? { objetivo: leccion.piezas[0]?.pos ?? [0, 1.6, 0], distancia: 7 },
    escenario: escenario ? { id: escenario.id, titulo: escenario.titulo } : null,
    vista: vistas(tecnico.id).has(leccion.id),
    siguiente: siguiente ? { id: siguiente.id, titulo: siguiente.titulo } : null,
  };
}

export function marcarVista(tecnicoId, leccionId) {
  const tecnico = validarTecnico(tecnicoId);
  if (!porId.has(leccionId)) throw errorHttp(404, 'Lección no encontrada');
  db.prepare('INSERT OR IGNORE INTO lecciones_vistas (tecnico_id, leccion_id) VALUES (?, ?)').run(
    tecnico.id,
    leccionId,
  );
  return { vistas: vistas(tecnico.id).size, total: temario.length };
}
