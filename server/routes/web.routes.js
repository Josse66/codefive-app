import { Router } from 'express';
import { mostrarInicio } from '#controllers/inicio.controller.js';
import { mostrarDiagnostico } from '#controllers/vistas.controller.js';

const router = Router();

router.get('/', mostrarInicio);
router.get('/tecnicos/:id/diagnostico', mostrarDiagnostico);

export default router;
