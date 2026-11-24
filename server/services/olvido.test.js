import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarOlvido,
  estabilidadTrasPractica,
  estabilidadTrasRepaso,
  OLVIDO,
  retencion,
} from './modelo.js';

const cerca = (a, b) => assert.ok(Math.abs(a - b) < 0.001, `${a} no es ${b}`);

test('la retención es 1 el mismo día y e^(−1) cuando pasan S días', () => {
  cerca(retencion(0, 7), 1);
  cerca(retencion(7, 7), Math.exp(-1));
});

test('el olvido regresa hacia el punto de partida, no hacia cero', () => {
  const p = aplicarOlvido(0.9, 0.3, 1000, 5);
  cerca(p, 0.3);
  cerca(aplicarOlvido(0.9, 0.3, 0, 5), 0.9);
});

test('si no aprendió nada, no hay nada que olvidar', () => {
  cerca(aplicarOlvido(0.3, 0.5, 7, 5), 0.3);
});

test('la estabilidad tras practicar crece con los aciertos', () => {
  assert.ok(estabilidadTrasPractica(1) > estabilidadTrasPractica(0.5));
  cerca(estabilidadTrasPractica(0), OLVIDO.estabilidadTrasPractica.base);
});

test('un repaso bien contestado alarga la estabilidad y uno mal contestado la acorta', () => {
  cerca(estabilidadTrasRepaso(6, 1), 6 * OLVIDO.crecimientoRepaso);
  assert.ok(estabilidadTrasRepaso(6, 0) < 6);
  assert.ok(estabilidadTrasRepaso(2, 0) >= OLVIDO.estabilidadMinima);
});
