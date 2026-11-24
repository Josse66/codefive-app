import fs from 'node:fs';
import path from 'node:path';
import db from '#db/conexion.js';
import { errorHttp } from '#helpers/errores.js';
import { NUMEROS_GRUPO, descripcionGrupo, nombreGrupo } from '#helpers/formato.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { asegurarDominio, obtenerPerfil } from '#services/dominio.service.js';
import { obtenerRuta } from '#services/ruta.service.js';
import { listarEscenarios } from '#services/escenarios.js';
import { resumenTaller } from '#services/taller.service.js';
import { aplicaAlModelo, modeloDelTecnico } from '#services/modelos.service.js';
import { yaEmpezo } from '#services/carrera.service.js';
import { obtenerMision } from '#services/mision.service.js';

// "Mi plan de formación": la página de inicio de cada técnico. Junta su autobús, su siguiente paso
// y los 9 módulos (grupos de función) con solo lo que aplica a ese autobús.

const temario = JSON.parse(fs.readFileSync(path.resolve('data', 'temario.json'), 'utf8'));
const leccionDe = new Map(temario.map((l) => [l.competencia, l]));

function siguientePaso(tecnicoId, diagnosticado) {
  if (!diagnosticado) {
    return {
      titulo: 'Haz tu diagnóstico',
      texto:
        'Unas preguntas por grupo de función para saber qué dominas. Así tu plan empieza donde lo necesitas.',
      enlace: `/tecnicos/${tecnicoId}/diagnostico`,
      boton: 'Empezar diagnóstico',
    };
  }
  const [paso] = obtenerRuta(tecnicoId).pasos;
  if (!paso) {
    return {
      titulo: 'Dominas todo tu plan',
      texto: 'Atiende órdenes en el Taller para mantener lo aprendido y subir de nivel.',
      enlace: `/tecnicos/${tecnicoId}/taller`,
      boton: 'Ir al taller',
    };
  }
  // Cada paso del plan es una misión de 4 pasos; el botón lleva al que toca.
  const leccion = leccionDe.get(paso.competencia.id);
  const mision = obtenerMision(tecnicoId, paso.competencia.id);
  const toca = mision?.actual ?? mision?.pasos.find((p) => p.clave === 'hazlo');
  return {
    titulo: leccion?.titulo ?? paso.competencia.nombre,
    texto: paso.obligatoria
      ? 'Es de seguridad: va antes que todo lo demás de este grupo.'
      : 'Es lo que más te ayuda ahora según tu diagnóstico.',
    enlace: toca?.enlace ?? `/tecnicos/${tecnicoId}/practica/${paso.competencia.id}`,
    boton: mision?.pasos.some((p) => p.hecho) ? `Continuar: ${toca?.nombre ?? 'Hazlo'}` : 'Empezar misión',
    pasos: mision?.pasos ?? [],
    grupo: paso.competencia.grupo,
    obligatoria: paso.obligatoria,
  };
}

export function obtenerPlan(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  asegurarDominio(tecnico);
  const modelo = modeloDelTecnico(tecnico);
  const { competencias } = obtenerPerfil(tecnico.id);
  // Ya tiene punto de partida si hizo el diagnóstico o eligió empezar como principiante.
  const diagnosticado = yaEmpezo(tecnico);
  const vistas = new Set(
    db
      .prepare('SELECT leccion_id FROM lecciones_vistas WHERE tecnico_id = ?')
      .all(tecnico.id)
      .map((f) => f.leccion_id),
  );
  const escenarios = listarEscenarios().filter((e) => aplicaAlModelo(e.tecnologia, modelo));

  const modulos = NUMEROS_GRUPO.map((grupo) => {
    const delGrupo = competencias.filter((c) => c.grupo === grupo && aplicaAlModelo(c.tecnologia, modelo));
    const lecciones = delGrupo
      .map((c) => leccionDe.get(c.id))
      .filter(Boolean)
      .map((l) => {
        const c = delGrupo.find((x) => x.id === l.competencia);
        return {
          id: l.id,
          titulo: l.titulo,
          nivel: c.nivel,
          minutos: l.minutos,
          vista: vistas.has(l.id),
          critica: c.critica,
        };
      })
      .sort((a, b) => a.nivel - b.nivel);
    const escenario = escenarios.find((e) => e.grupo === grupo);
    const dominio = delGrupo.length
      ? Math.round((delGrupo.reduce((s, c) => s + c.pSaber, 0) / delGrupo.length) * 100)
      : null;
    let estado = 'brecha';
    if (dominio >= 80) estado = 'dominada';
    else if (dominio >= 40) estado = 'en_desarrollo';
    return {
      grupo,
      nombre: nombreGrupo(grupo),
      descripcion: descripcionGrupo(grupo),
      aplica: delGrupo.length > 0,
      dominio: diagnosticado ? dominio : null,
      estado: diagnosticado ? estado : 'sin_evaluar',
      lecciones,
      vistas: lecciones.filter((l) => l.vista).length,
      escenario: escenario
        ? { id: escenario.id, titulo: escenario.titulo, profundidad: escenario.profundidad }
        : null,
    };
  });

  return {
    tecnico: {
      id: tecnico.id,
      nombre: tecnico.nombre,
      taller: tecnico.taller,
      anios: tecnico.anios_experiencia,
    },
    modelo,
    diagnosticado,
    siguiente: siguientePaso(tecnico.id, diagnosticado),
    progreso: resumenTaller(tecnico.id),
    avance: {
      lecciones: modulos.reduce((s, m) => s + m.vistas, 0),
      total: modulos.reduce((s, m) => s + m.lecciones.length, 0),
    },
    modulos,
  };
}
