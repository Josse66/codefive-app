import test from 'node:test';
import assert from 'node:assert/strict';
import {
  XP_BASE,
  calificarOrden,
  desbloqueado,
  nivelEfectivo,
  nivelPorXp,
  progresoNivel,
  reputacion,
} from './taller.js';

test('la experiencia sube de nivel en los umbrales', () => {
  assert.equal(nivelPorXp(0), 0);
  assert.equal(nivelPorXp(399), 0);
  assert.equal(nivelPorXp(400), 1);
  assert.equal(nivelPorXp(2500), 3);
});

test('el diagnóstico ubica a quien ya domina mucho aunque no tenga experiencia en el taller', () => {
  assert.equal(nivelEfectivo(0, 0.5), 2);
  assert.equal(nivelEfectivo(1300, 0.1), 2);
});

test('un aprendiz solo abre escenarios de nivel 1', () => {
  assert.equal(desbloqueado(1, 0), true);
  assert.equal(desbloqueado(2, 0), false);
  assert.equal(desbloqueado(3, 2), true);
});

test('una orden limpia y a tiempo da tres estrellas y bono', () => {
  const r = calificarOrden({ nivel: 2, segundos: 120 });
  assert.equal(r.estrellas, 3);
  assert.equal(r.xp, XP_BASE[2] + Math.round(XP_BASE[2] * 0.2));
});

test('un error crítico deja una estrella', () => {
  assert.equal(calificarOrden({ nivel: 2, criticos: 1, segundos: 60 }).estrellas, 1);
});

test('cambiar refacciones de más quita la tercera estrella', () => {
  const r = calificarOrden({ nivel: 1, gasto: 2580, gastoNecesario: 180, segundos: 60 });
  assert.equal(r.estrellas, 2);
});

test('terminar siempre da algo de experiencia', () => {
  const r = calificarOrden({ nivel: 1, errores: 10, criticos: 3, segundos: 9999 });
  assert.ok(r.xp > 0);
});

test('el avance al siguiente nivel va de 0 a 1', () => {
  const p = progresoNivel(800, 1);
  assert.equal(p.nombre, 'Técnico');
  assert.equal(p.avance, 0.5);
  assert.equal(progresoNivel(3000, 3).avance, 1);
});

test('la reputación promedia las últimas estrellas', () => {
  assert.equal(reputacion([3, 2, 1]), 2);
  assert.equal(reputacion([]), null);
});
