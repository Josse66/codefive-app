import { Router } from 'express';
import * as tecnicos from '#controllers/tecnicos.controller.js';
import * as diagnostico from '#controllers/diagnostico.controller.js';
import * as practica from '#controllers/practica.controller.js';
import * as evaluacion from '#controllers/evaluacion.controller.js';
import * as escenarios from '#controllers/escenarios.controller.js';
import * as taller from '#controllers/taller.controller.js';
import * as aprender from '#controllers/aprender.controller.js';
import { obtenerTablero } from '#services/tablero.service.js';

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

router.get('/tecnicos/:id/evaluacion/:competenciaId', evaluacion.obtener);
router.post('/tecnicos/:id/evaluacion/:competenciaId', evaluacion.responder);
router.post('/tecnicos/:id/simular-dias', evaluacion.simular);

router.get('/escenarios', escenarios.listar);
router.get('/tecnicos/:id/escenarios', escenarios.delTecnico);
router.get('/tecnicos/:id/escenarios/:escenarioId', escenarios.iniciar);
router.post('/eventos', escenarios.evento);

router.get('/tecnicos/:id/taller', taller.obtener);
router.post('/tecnicos/:id/taller/ordenes/:ordenId/iniciar', taller.iniciar);

router.get('/tecnicos/:id/aprender', aprender.temario);
router.get('/tecnicos/:id/aprender/:leccionId', aprender.leccion);
router.post('/tecnicos/:id/aprender/:leccionId/vista', aprender.vista);

router.get('/tablero', (_req, res) => res.json(obtenerTablero()));

export default router;
