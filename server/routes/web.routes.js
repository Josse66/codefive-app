import { Router } from 'express';
import { mostrarInicio } from '#controllers/inicio.controller.js';
import {
  mostrarDiagnostico,
  mostrarPerfil,
  mostrarPractica,
  mostrarRuta,
} from '#controllers/vistas.controller.js';

const router = Router();

router.get('/', mostrarInicio);
router.get('/tecnicos/:id/diagnostico', mostrarDiagnostico);
router.get('/tecnicos/:id/perfil', mostrarPerfil);
router.get('/tecnicos/:id/ruta', mostrarRuta);
router.get('/tecnicos/:id/practica/:competenciaId', mostrarPractica);

export default router;
