import { Router } from 'express';
import * as tecnicos from '#controllers/tecnicos.controller.js';
import * as diagnostico from '#controllers/diagnostico.controller.js';

const router = Router();

router.get('/salud', (_req, res) => res.json({ ok: true, servicio: 'codefive-app' }));

router.get('/tecnicos', tecnicos.listar);
router.get('/tecnicos/:id', tecnicos.obtener);
router.get('/tecnicos/:id/perfil', diagnostico.perfil);
router.get('/tecnicos/:id/ruta', diagnostico.ruta);

router.post('/diagnostico', diagnostico.iniciar);
router.post('/diagnostico/:sesionId/respuestas', diagnostico.responder);

export default router;
