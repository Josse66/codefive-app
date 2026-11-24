import { Router } from 'express';
import { mostrarInicio } from '#controllers/inicio.controller.js';
import { mostrarDiagnostico, mostrarPerfil } from '#controllers/vistas.controller.js';

const router = Router();

router.get('/', mostrarInicio);
router.get('/tecnicos/:id/diagnostico', mostrarDiagnostico);
router.get('/tecnicos/:id/perfil', mostrarPerfil);

export default router;
