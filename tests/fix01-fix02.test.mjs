import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  crearColaboracionVacia,
  tieneCantidadSinEspecialidad,
} from '../src/lib/colaboraciones-form.ts';

const nuevo = readFileSync(new URL('../src/app/allanamientos/nuevo/page.tsx', import.meta.url), 'utf8');
const editar = readFileSync(new URL('../src/app/allanamientos/editar/[id]/page.tsx', import.meta.url), 'utf8');
const migracionEspecialidad = readFileSync(new URL('../scripts/sql/COP_fix01_fix02_especialidad_colaboracion_no_vacia.sql', import.meta.url), 'utf8');
const rollbackEspecialidad = readFileSync(new URL('../scripts/sql/COP_fix01_fix02_especialidad_colaboracion_no_vacia_rollback.sql', import.meta.url), 'utf8');

test('FIX-01: el destino elevado inicia vacío y no acepta preselección por URL/perfil', () => {
  assert.match(nuevo, /useState<string>\(''\)/);
  assert.doesNotMatch(nuevo, /useSearchParams|superintendenciaUrl/);
  assert.doesNotMatch(nuevo, /setSuperintendenciaSeleccionada\(profile/);
  assert.match(nuevo, /superintendenciasList\.some\(\s*\(superintendencia\) => superintendencia\.id === targetSuperintendenciaId,?\s*\)/);
  assert.match(nuevo, /const targetSuperintendenciaId\s*=\s*esElevado\s*\?\s*superintendenciaSeleccionada\s*:\s*superintendenciaUsuario/s);
});

test('FIX-01: edición conserva el destino existente', () => {
  assert.match(editar, /superintendencia_id:\s*data\.superintendencia_id\s*\|\|\s*''/);
});

test('FIX-02: filas vacías nacen 0/0 y especialidad sin cantidades se omite', () => {
  assert.deepEqual(crearColaboracionVacia(), {
    especialidad: '', cant_solicitada: 0, cant_afectada: 0,
  });
  assert.match(nuevo, /useState\(\[crearColaboracionVacia\(\)\]\)/);
  assert.match(nuevo, /prev => \[\.\.\.prev, crearColaboracionVacia\(\)\]/);
  assert.match(editar, /setColaboraciones\(\[crearColaboracionVacia\(\)\]\)/);
  assert.match(editar, /prev => \[\.\.\.prev, crearColaboracionVacia\(\)\]/);
  assert.match(nuevo, /colaboraciones\.filter\(c => c\.especialidad\.trim\(\)\)/);
  assert.match(editar, /colaboraciones\.filter\(c => c\.especialidad\.trim\(\)\)/);
});

test('FIX-02: impide guardar cantidades en una fila sin especialidad', () => {
  assert.equal(tieneCantidadSinEspecialidad([
    { especialidad: '', cant_solicitada: 1, cant_afectada: 0 },
  ]), true);
  assert.equal(tieneCantidadSinEspecialidad([
    { especialidad: 'K9', cant_solicitada: 0, cant_afectada: 0 },
  ]), false);
  assert.equal(tieneCantidadSinEspecialidad([
    { especialidad: '', cant_solicitada: 0, cant_afectada: 0 },
  ]), false);
  assert.match(nuevo, /if \(tieneCantidadSinEspecialidad\(colaboraciones\)\)/);
  assert.match(editar, /if \(tieneCantidadSinEspecialidad\(colaboraciones\)\)/);
});

test('FIX-02: edición conserva las cantidades cargadas del registro', () => {
  assert.match(editar, /cant_solicitada:\s*c\.cant_solicitada/);
  assert.match(editar, /cant_afectada:\s*c\.cant_afectada/);
});

test('FIX-02: migración protege servidor y RPC de especialidades vacías, con rollback acotado', () => {
  assert.ok(migracionEspecialidad.includes("especialidad !~ '[^[:space:]]'"));
  assert.ok(migracionEspecialidad.includes("CHECK (especialidad ~ '[^[:space:]]') NOT VALID"));
  assert.match(migracionEspecialidad, /VALIDATE CONSTRAINT especialidad_no_vacia/);
  assert.match(migracionEspecialidad, /RAISE EXCEPTION/);
  assert.match(rollbackEspecialidad, /DROP CONSTRAINT especialidad_no_vacia/);
  assert.doesNotMatch(rollbackEspecialidad, /DROP TABLE|DELETE FROM|DROP FUNCTION/);
});
