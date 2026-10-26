import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { prepararHorarioEjecucion } from '../src/lib/allanamientos.ts';

const actual = { fechaEjecucion: '2026-10-26' };

test('alta exige hora y minuto explícitos, sin horario supuesto', () => {
  assert.deepEqual(prepararHorarioEjecucion({ ...actual, hora: '', minuto: '' }), {
    ok: false, error: 'Seleccioná una hora y un minuto de ejecución válidos.',
  });
  assert.equal(prepararHorarioEjecucion({ ...actual, hora: '12', minuto: '' }).ok, false);
  assert.equal(prepararHorarioEjecucion({ ...actual, hora: '', minuto: '00' }).ok, false);
});

test('alta y edición actuales envían horario válido y en_el_acto=false', () => {
  for (const [hora, minuto] of [['00', '00'], ['12', '00'], ['23', '59']]) {
    assert.deepEqual(prepararHorarioEjecucion({ ...actual, hora, minuto }), {
      ok: true, horarioEjecucion: `${hora}:${minuto}`, enElActo: false,
    });
  }
  assert.deepEqual(prepararHorarioEjecucion({
    ...actual, hora: '17', minuto: '45',
    original: { fechaEjecucion: actual.fechaEjecucion, horarioEjecucion: '10:00:00', enElActo: false },
  }), { ok: true, horarioEjecucion: '17:45', enElActo: false });
});

test('rechaza horas/minutos fuera de rango o mal formados antes del envío', () => {
  for (const [hora, minuto] of [['24', '00'], ['-1', '00'], ['9', '00'], ['12', '60'], ['12', '-1'], ['12', '0']]) {
    assert.equal(prepararHorarioEjecucion({ ...actual, hora, minuto }).ok, false);
  }
});

test('edición histórica conserva exactamente valores nulos previos al corte', () => {
  for (const enElActo of [true, false]) {
    assert.deepEqual(prepararHorarioEjecucion({
      fechaEjecucion: '2026-09-27', hora: '', minuto: '',
      original: { fechaEjecucion: '2026-09-27', horarioEjecucion: null, enElActo },
    }), { ok: true, horarioEjecucion: null, enElActo });
  }
});

test('un cambio de fecha o un registro posterior al corte ya no conserva En el acto', () => {
  const original = { fechaEjecucion: '2026-09-27', horarioEjecucion: null, enElActo: true };
  assert.equal(prepararHorarioEjecucion({ fechaEjecucion: '2026-09-28', hora: '', minuto: '', original }).ok, false);
  assert.equal(prepararHorarioEjecucion({ fechaEjecucion: '2026-09-26', hora: '', minuto: '', original }).ok, false);
  assert.deepEqual(prepararHorarioEjecucion({ fechaEjecucion: '2026-09-28', hora: '08', minuto: '30', original }), {
    ok: true, horarioEjecucion: '08:30', enElActo: false,
  });
  assert.equal(prepararHorarioEjecucion({
    ...actual, hora: '', minuto: '',
    original: { fechaEjecucion: actual.fechaEjecucion, horarioEjecucion: null, enElActo: true },
  }).ok, false);
});

test('informar horario en un registro histórico elimina En el acto sólo por elección explícita', () => {
  assert.deepEqual(prepararHorarioEjecucion({
    fechaEjecucion: '2026-09-27', hora: '18', minuto: '05',
    original: { fechaEjecucion: '2026-09-27', horarioEjecucion: null, enElActo: true },
  }), { ok: true, horarioEjecucion: '18:05', enElActo: false });
});

test('ambos formularios validan antes de RPC, no ofrecen En el acto ni exhiben mensajes SQL', () => {
  for (const ruta of [
    '../src/app/allanamientos/nuevo/page.tsx',
    '../src/app/allanamientos/editar/[id]/page.tsx',
  ]) {
    const fuente = readFileSync(new URL(ruta, import.meta.url), 'utf8');
    assert.match(fuente, /prepararHorarioEjecucion\(/);
    assert.match(fuente, /horario_ejecucion: horario\.horarioEjecucion/);
    assert.match(fuente, /en_el_acto: horario\.enElActo/);
    assert.doesNotMatch(fuente, /checked=\{enElActo\}/);
    assert.doesNotMatch(fuente, /setError\(err\.message/);
  }
});
