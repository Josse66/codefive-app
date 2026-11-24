import { Router } from 'express';
import * as tecnicos from '#controllers/tecnicos.controller.js';

const router = Router();

router.get('/salud', (_req, res) => res.json({ ok: true, servicio: 'codefive-app' }));

router.get('/tecnicos', tecnicos.listar);
router.get('/tecnicos/:id', tecnicos.obtener);

export default router;
