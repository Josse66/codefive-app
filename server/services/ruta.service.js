import { asegurarDominio, obtenerPerfil } from '#services/dominio.service.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { errorHttp } from '#helpers/errores.js';
import { armarRuta } from '#services/ruta.js';
import { escenariosPorCompetencia } from '#services/escenarios.js';

export function obtenerRuta(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  asegurarDominio(tecnico);
  const perfil = obtenerPerfil(tecnicoId);
  return { tecnico, pasos: armarRuta(perfil.competencias, perfil.alertas, escenariosPorCompetencia()) };
}
