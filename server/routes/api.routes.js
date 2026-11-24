import { Router } from 'express';
import * as tecnicos from '#controllers/tecnicos.controller.js';
import * as diagnostico from '#controllers/diagnostico.controller.js';
import * as practica from '#controllers/practica.controller.js';

const router = Router();

router.get('/salud', (_req, res) => res.json({ ok: true, servicio: 'codefive-app' }));

router.get('/tecnicos', tecnicos.listar);
router.get('/tecnicos/:id', tecnicos.obtener);
router.get('/tecnicos/:id/perfil', diagnostico.perfil);
router.get('/tecnicos/:id/ruta', diagnostico.ruta);

router.post('/diagnostico', diagnostico.iniciar);
router.post('/diagnostico/:sesionId/respuestas', diagnostico.responder);

router.get('/tecnicos/:id/practica/:competenciaId', practica.obtener);
router.post('/tecnicos/:id/practica/respuestas', practica.responder);

export default router;
