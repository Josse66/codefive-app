import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escenariosPorCompetencia,
  evaluarIntento,
  listarEscenarios,
  obtenerEscenario,
  paraCliente,
  progresoInicial,
} from './escenarios.js';

const hv = obtenerEscenario('hv-aislamiento');

// Recorre el escenario contestando bien hasta llegar al paso indicado.
function avanzarHasta(escenario, pasoId) {
  let progreso = progresoInicial();
  while (escenario.pasos[progreso.paso].id !== pasoId) {
    const paso = escenario.pasos[progreso.paso];
    const intento =
      paso.tipo === 'hipotesis'
        ? { pasoId: paso.id, opcion: paso.correcta }
        : { pasoId: paso.id, accion: paso.correcta[progreso.subpaso] };
    progreso = evaluarIntento(escenario, progreso, intento).progreso;
  }
  return progreso;
}

test('hay un escenario por cada grupo de función del 1 al 9', () => {
  assert.deepEqual(
    listarEscenarios().map((e) => e.grupo),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test('todos los escenarios se pueden completar contestando bien', () => {
  listarEscenarios().forEach((escenario) => {
    let progreso = progresoInicial();
    let vueltas = 0;
    while (!progreso.terminado && vueltas < 50) {
      const paso = escenario.pasos[progreso.paso];
      const intento =
        paso.tipo === 'hipotesis'
          ? { pasoId: paso.id, opcion: paso.correcta }
          : { pasoId: paso.id, accion: paso.correcta[progreso.subpaso] };
      const resultado = evaluarIntento(escenario, progreso, intento);
      assert.equal(resultado.correcta, true, `${escenario.id}/${paso.id}`);
      progreso = resultado.progreso;
      vueltas += 1;
    }
    assert.equal(progreso.terminado, true, escenario.id);
  });
});

test('tocar un conector de alto voltaje energizado es error crítico que bloquea', () => {
  const progreso = avanzarHasta(hv, 'desenergizar');
  const resultado = evaluarIntento(hv, progreso, { pasoId: 'desenergizar', accion: 'mano>conector_hv' });
  assert.equal(resultado.correcta, false);
  assert.equal(resultado.error.codigo, 'HV-01');
  assert.equal(resultado.error.critico, true);
  assert.equal(resultado.error.consecuencia, 'bloqueo');
  assert.equal(resultado.progreso.paso, progreso.paso);
});

test('medir sin probar el medidor rompe "probar, medir, volver a probar"', () => {
  const progreso = avanzarHasta(hv, 'verificar');
  const resultado = evaluarIntento(hv, progreso, {
    pasoId: 'verificar',
    accion: 'multimetro>punto_medicion',
  });
  assert.equal(resultado.error.codigo, 'HV-04');
});

test('la secuencia avanza por subpasos y un error la reinicia', () => {
  let progreso = avanzarHasta(hv, 'verificar');
  let resultado = evaluarIntento(hv, progreso, { pasoId: 'verificar', accion: 'multimetro>fuente_prueba' });
  assert.equal(resultado.completaPaso, false);
  assert.equal(resultado.progreso.subpaso, 1);
  progreso = resultado.progreso;
  resultado = evaluarIntento(hv, progreso, { pasoId: 'verificar', accion: 'candado>conector_hv' });
  assert.equal(resultado.error.critico, false);
  assert.equal(resultado.progreso.subpaso, 0);
});

test('no acepta un paso que no es el actual', () => {
  const resultado = evaluarIntento(hv, progresoInicial(), {
    pasoId: 'loto',
    accion: 'candado>desconexion_servicio',
  });
  assert.ok(resultado.invalido);
});

test('el navegador no recibe respuestas ni errores', () => {
  const cliente = JSON.stringify(paraCliente(hv));
  assert.ok(!cliente.includes('HV-01'));
  assert.ok(!cliente.includes('"correcta"'));
});

test('cada competencia de los escenarios apunta a su escenario', () => {
  const mapa = escenariosPorCompetencia();
  assert.equal(mapa['E3-2-SEG'], 'hv-aislamiento');
  assert.equal(mapa['A5-1-SEG'], 'frenos-fuga');
  assert.equal(mapa['A9-1-SEG'], 'supresion-incendios');
});
