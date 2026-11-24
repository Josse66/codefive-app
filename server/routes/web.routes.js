import { Router } from 'express';
import { mostrarInicio } from '#controllers/inicio.controller.js';
import {
  mostrarAutobus,
  mostrarLeccion,
  mostrarTemario,
  mostrarDiagnostico,
  mostrarEscenario,
  mostrarEvaluacion,
  mostrarOrden,
  mostrarPerfil,
  mostrarPractica,
  mostrarRuta,
  mostrarTaller,
  mostrarTablero,
} from '#controllers/vistas.controller.js';

const router = Router();

router.get('/', mostrarInicio);
router.get('/volvo', mostrarTablero);
router.get('/tecnicos/:id/diagnostico', mostrarDiagnostico);
router.get('/tecnicos/:id/perfil', mostrarPerfil);
router.get('/tecnicos/:id/ruta', mostrarRuta);
router.get('/tecnicos/:id/practica/:competenciaId', mostrarPractica);
router.get('/tecnicos/:id/evaluacion/:competenciaId', mostrarEvaluacion);
router.get('/tecnicos/:id/autobus', mostrarAutobus);
router.get('/tecnicos/:id/taller', mostrarTaller);
router.get('/tecnicos/:id/aprender', mostrarTemario);
router.get('/tecnicos/:id/aprender/:leccionId', mostrarLeccion);
router.get('/tecnicos/:id/taller/orden/:ordenId', mostrarOrden);
router.get('/tecnicos/:id/escenario/:escenarioId', mostrarEscenario);

export default router;
