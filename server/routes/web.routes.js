import { Router } from 'express';
import { mostrarInicio } from '#controllers/inicio.controller.js';
import * as cuentas from '#controllers/cuentas.controller.js';
import {
  empezarPrincipiante,
  mostrarAutobus,
  mostrarDesempeno,
  mostrarDiagnostico,
  mostrarEmpezar,
  mostrarResultados,
  mostrarEscenario,
  mostrarEvaluacion,
  mostrarLeccion,
  mostrarOrden,
  mostrarPerfil,
  mostrarPlan,
  mostrarPractica,
  mostrarRuta,
  mostrarTablero,
  mostrarTaller,
  mostrarTemario,
} from '#controllers/vistas.controller.js';
import { exigirSesion, exigirTecnico, exigirVolvo } from '#helpers/sesion.js';

const router = Router();

// Acceso
router.get('/', cuentas.inicio);
router.get('/entrar', cuentas.mostrarEntrar);
router.post('/entrar', cuentas.entrar);
router.post('/salir', cuentas.salir);
router.get('/registro', cuentas.mostrarRegistro);
router.post('/registro', cuentas.registrar);
router.get('/bienvenida', exigirSesion, cuentas.mostrarBienvenida);
router.post('/bienvenida', exigirSesion, cuentas.guardarBienvenida);

// Capacitación Volvo: panel y red de técnicos
router.get('/volvo', exigirVolvo, mostrarTablero);
router.get('/tecnicos', exigirVolvo, mostrarInicio);

// Páginas del técnico: cada quien solo las suyas (Volvo puede ver todas)
router.use('/tecnicos/:id', exigirTecnico);
router.get('/tecnicos/:id/empezar', mostrarEmpezar);
router.post('/tecnicos/:id/empezar/principiante', empezarPrincipiante);
router.get('/tecnicos/:id/resultados', mostrarResultados);
router.get('/tecnicos/:id/plan', mostrarPlan);
router.get('/tecnicos/:id/diagnostico', mostrarDiagnostico);
router.get('/tecnicos/:id/perfil', mostrarPerfil);
router.get('/tecnicos/:id/desempeno', mostrarDesempeno);
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
