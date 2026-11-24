import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actualizarBKT,
  actualizarElo,
  cuadranteConfianza,
  estadoDominio,
  priorInicial,
  probabilidadElo,
} from './modelo.js';

const cerca = (a, b) => assert.ok(Math.abs(a - b) < 0.001, `${a} no es ${b}`);

test('BKT reproduce el ejemplo de la investigación (L0=0.30, T=0.10, G=0.20, S=0.10)', () => {
  const p = { adivinar: 0.2, descuido: 0.1, aprender: 0.1 };
  const trasAcierto = actualizarBKT(0.3, true, p);
  cerca(trasAcierto, 0.693);
  cerca(actualizarBKT(trasAcierto, false, p), 0.298);
});

test('BKT sube con aciertos y baja con errores', () => {
  assert.ok(actualizarBKT(0.5, true, { aprender: 0 }) > 0.5);
  assert.ok(actualizarBKT(0.5, false, { aprender: 0 }) < 0.5);
});

test('estado del dominio por umbral', () => {
  assert.equal(estadoDominio(0.9), 'dominada');
  assert.equal(estadoDominio(0.5), 'en_desarrollo');
  assert.equal(estadoDominio(0.1), 'brecha');
});

test('Elo: misma habilidad y dificultad da 50%', () => {
  cerca(probabilidadElo(0, 0), 0.5);
});

test('Elo: acertar sube la habilidad y baja la dificultad de la pregunta', () => {
  const r = actualizarElo(0, 0, true);
  assert.ok(r.theta > 0);
  assert.ok(r.dificultad < 0);
});

test('prior: experto en su tecnología parte más alto que en la otra', () => {
  const luis = { anios_experiencia: 12, tecnologia: 'diesel' };
  const diesel = priorInicial(luis, { tecnologia: 'diesel', nivel: 2 });
  const electrica = priorInicial(luis, { tecnologia: 'electrica', nivel: 2 });
  assert.ok(diesel > electrica);
});

test('confianza: seguro y equivocado se detecta', () => {
  assert.equal(cuadranteConfianza(false, 3), 'seguro_equivocado');
  assert.equal(cuadranteConfianza(true, 1), 'inseguro_correcto');
});
