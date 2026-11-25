import {
  bitacora,
  guardarProgreso,
  iniciarSesion,
  latido,
  obtenerSimulador,
  registrarAcciones,
  registrarEvaluacion,
} from '#services/simulador.service.js';

// Simulador del autobús completo: avance, sesiones, bitácora y evaluaciones del técnico.

export function obtener(req, res) {
  res.json(obtenerSimulador(req.params.id));
}

export function sesion(req, res) {
  res.status(201).json(iniciarSesion(req.params.id));
}

export function pulso(req, res) {
  res.json(latido(req.params.id, req.params.sesionId, req.body?.segundos));
}

export function acciones(req, res) {
  res.status(201).json(registrarAcciones(req.params.id, req.body?.sesionId, req.body?.acciones));
}

export function evaluacion(req, res) {
  res.status(201).json(registrarEvaluacion(req.params.id, req.body ?? {}));
}

export function progreso(req, res) {
  res.json(guardarProgreso(req.params.id, req.params.sistema, req.body?.datos));
}

export function verBitacora(req, res) {
  res.json(bitacora(req.params.id));
}
