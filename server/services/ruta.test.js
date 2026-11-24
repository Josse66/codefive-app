import test from 'node:test';
import assert from 'node:assert/strict';
import { armarRuta, modoDeAyuda } from './ruta.js';
import { estadoDominio } from './modelo.js';

const c = (id, pSaber, extra = {}) => ({
  id,
  nombre: id,
  critica: false,
  prerequisito: null,
  pSaber,
  estado: estadoDominio(pSaber),
  ...extra,
});

test('las dominadas no entran a la ruta', () => {
  const ruta = armarRuta([c('A', 0.9), c('B', 0.3)]);
  assert.deepEqual(
    ruta.map((p) => p.competencia.id),
    ['B'],
  );
});

test('seguridad crítica va antes que una brecha más grande', () => {
  const ruta = armarRuta([c('GRANDE', 0.05), c('SEG', 0.3, { critica: true })]);
  assert.equal(ruta[0].competencia.id, 'SEG');
});

test('"seguro pero equivocado" en seguridad crítica va primero y es obligatoria', () => {
  const ruta = armarRuta(
    [c('SEG1', 0.2, { critica: true }), c('SEG2', 0.3, { critica: true })],
    [{ competenciaId: 'SEG2' }],
  );
  assert.equal(ruta[0].competencia.id, 'SEG2');
  assert.equal(ruta[0].obligatoria, true);
});

test('el prerrequisito pendiente va antes que lo que depende de él', () => {
  const ruta = armarRuta([c('AVANZADA', 0.05, { prerequisito: 'BASE' }), c('BASE', 0.5)]);
  assert.deepEqual(
    ruta.map((p) => p.competencia.id),
    ['BASE', 'AVANZADA'],
  );
  assert.equal(ruta[1].bloqueadaPor.id, 'BASE');
});

test('modo de ayuda se retira conforme sube el dominio', () => {
  assert.equal(modoDeAyuda(0.2), 'guiado');
  assert.equal(modoDeAyuda(0.6), 'con_pistas');
  assert.equal(modoDeAyuda(0.9), 'autonomo');
});

test('con la misma prioridad, primero el nivel más básico', () => {
  const ruta = armarRuta([c('N3', 0.05, { nivel: 3 }), c('N2', 0.15, { nivel: 2 })]);
  assert.deepEqual(
    ruta.map((p) => p.competencia.id),
    ['N2', 'N3'],
  );
});
