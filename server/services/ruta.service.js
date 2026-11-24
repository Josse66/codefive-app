import { asegurarDominio, obtenerPerfil } from '#services/dominio.service.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';
import { aplicaAlModelo, modeloDelTecnico } from '#services/modelos.service.js';
import { errorHttp } from '#helpers/errores.js';
import { armarRuta } from '#services/ruta.js';
import { escenariosPorCompetencia } from '#services/escenarios.js';

export function obtenerRuta(tecnicoId) {
  const tecnico = obtenerTecnico(tecnicoId);
  if (!tecnico) throw errorHttp(404, 'Técnico no encontrado');
  asegurarDominio(tecnico);
  const perfil = obtenerPerfil(tecnicoId);
  return {
    tecnico,
    // La ruta solo incluye lo que aplica a su autobús.
    pasos: armarRuta(
      perfil.competencias.filter((c) => aplicaAlModelo(c.tecnologia, modeloDelTecnico(tecnico))),
      perfil.alertas,
      escenariosPorCompetencia(),
    ),
  };
}
