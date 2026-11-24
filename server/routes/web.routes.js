import { Router } from 'express';
import { mostrarInicio } from '#controllers/inicio.controller.js';

const router = Router();

router.get('/', mostrarInicio);

export default router;
