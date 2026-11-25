import { Router } from 'express';
import * as tecnicos from '#controllers/tecnicos.controller.js';
import * as diagnostico from '#controllers/diagnostico.controller.js';
import * as practica from '#controllers/practica.controller.js';
import * as evaluacion from '#controllers/evaluacion.controller.js';
import * as escenarios from '#controllers/escenarios.controller.js';
import * as taller from '#controllers/taller.controller.js';
import * as aprender from '#controllers/aprender.controller.js';
import * as simulador from '#controllers/simulador.controller.js';
import * as gafetes from '#controllers/gafetes.controller.js';
import { obtenerTablero } from '#services/tablero.service.js';
import { indicesRed } from '#services/simulador.service.js';
import { exigirSesion, exigirTecnico, exigirVolvo } from '#helpers/sesion.js';

const router = Router();

router.get('/salud', (_req, res) => res.json({ ok: true, servicio: 'codefive-app' }));

// Entrar con gafete (QR) + PIN: no pide sesión. El responsable administra los gafetes.
router.post('/gafete', gafetes.leer);
router.post('/gafete/entrar', gafetes.entrar);
router.get('/gafetes', exigirVolvo, gafetes.listar);
router.put('/gafetes/:tecnicoId', exigirVolvo, gafetes.actualizar);

// Todo lo de un técnico pide sesión y que sea el mismo técnico (o Volvo).
router.use('/tecnicos/:id', exigirTecnico);
router.get('/tecnicos', exigirVolvo, tecnicos.listar);
router.get('/tecnicos/:id', tecnicos.obtener);
router.get('/tecnicos/:id/perfil', diagnostico.perfil);
router.get('/tecnicos/:id/ruta', diagnostico.ruta);

router.post('/diagnostico', exigirTecnico, diagnostico.iniciar);
router.post('/diagnostico/:sesionId/respuestas', exigirSesion, diagnostico.responder);

router.get('/tecnicos/:id/practica/:competenciaId', practica.obtener);
router.post('/tecnicos/:id/practica/respuestas', practica.responder);

router.get('/tecnicos/:id/evaluacion/:competenciaId', evaluacion.obtener);
router.post('/tecnicos/:id/evaluacion/:competenciaId', evaluacion.responder);
router.post('/tecnicos/:id/simular-dias', evaluacion.simular);

// Simulador del autobús completo: avance, sesiones con tiempo efectivo, bitácora y evaluaciones.
router.get('/tecnicos/:id/simulador', simulador.obtener);
router.post('/tecnicos/:id/simulador/sesiones', simulador.sesion);
router.post('/tecnicos/:id/simulador/sesiones/:sesionId/latido', simulador.pulso);
router.post('/tecnicos/:id/simulador/acciones', simulador.acciones);
router.post('/tecnicos/:id/simulador/evaluaciones', simulador.evaluacion);
router.put('/tecnicos/:id/simulador/progreso/:sistema', simulador.progreso);
router.get('/tecnicos/:id/simulador/bitacora', simulador.verBitacora);

router.get('/escenarios', escenarios.listar);
router.get('/tecnicos/:id/escenarios', escenarios.delTecnico);
router.get('/tecnicos/:id/escenarios/:escenarioId', escenarios.iniciar);
router.post('/eventos', exigirTecnico, escenarios.evento);

router.get('/tecnicos/:id/taller', taller.obtener);
router.post('/tecnicos/:id/taller/ordenes/:ordenId/iniciar', taller.iniciar);

router.get('/tecnicos/:id/aprender', aprender.temario);
router.get('/tecnicos/:id/aprender/:leccionId', aprender.leccion);
router.post('/tecnicos/:id/aprender/:leccionId/vista', aprender.vista);

router.get('/tablero', exigirVolvo, (_req, res) => res.json(obtenerTablero()));
router.get('/tablero/indices', exigirVolvo, (_req, res) => res.json(indicesRed()));

export default router;
