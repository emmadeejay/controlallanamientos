import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import XLSX from 'xlsx';
import { obtenerValoresSecuestros } from '../src/lib/allanamientos.ts';

const personas = (detalle, total) =>
  obtenerValoresSecuestros({
    detenidos_aprehendidos: detalle,
    detenidos_aprehendidos_cant: total,
  });

const verificar = (detalle, total, esperados) => {
  const { detenidos, aprehendidos, totalPersonas } = personas(detalle, total);
  assert.deepEqual(
    { detenidos, aprehendidos, totalPersonas },
    esperados,
  );
};

test('sólo Detenido: no atribuye Aprehendidos', () => {
  verificar([{ subtipo: 'Detenido', cantidad: 1 }], 1, {
    detenidos: 1, aprehendidos: 0, totalPersonas: 1,
  });
});

test('sólo Aprehendido: no duplica el total como Detenidos (caso piloto)', () => {
  verificar([{ subtipo: 'Aprehendido', cantidad: 1 }], 1, {
    detenidos: 0, aprehendidos: 1, totalPersonas: 1,
  });
});

test('desglose mixto conserva ambas categorías y el total', () => {
  verificar([
    { subtipo: 'Detenido', cantidad: 2 },
    { subtipo: 'Aprehendido', cantidad: 3 },
  ], 5, { detenidos: 2, aprehendidos: 3, totalPersonas: 5 });
});

test('total cero y detalle vacío permanecen en cero', () => {
  verificar([], 0, { detenidos: 0, aprehendidos: 0, totalPersonas: 0 });
  verificar(null, 0, { detenidos: 0, aprehendidos: 0, totalPersonas: 0 });
});

test('total histórico sin desglose conserva el respaldo legado', () => {
  verificar([], 4, { detenidos: 4, aprehendidos: 0, totalPersonas: 4 });
  verificar(null, 4, { detenidos: 4, aprehendidos: 0, totalPersonas: 4 });
  verificar(1, 0, { detenidos: 1, aprehendidos: 0, totalPersonas: 1 });
});

test('aliases históricos de desglosar conservan el reparto', () => {
  verificar([{ tipo: 'detenidos', cant: 2 }, { categoria: 'aprehendidos', cantidad: 3 }], 5, {
    detenidos: 2, aprehendidos: 3, totalPersonas: 5,
  });
  verificar({ detenido: 2, aprehendidos: 3 }, 5, {
    detenidos: 2, aprehendidos: 3, totalPersonas: 5,
  });
  verificar('[{"subtipo":"Aprehendido","cantidad":1}]', 1, {
    detenidos: 0, aprehendidos: 1, totalPersonas: 1,
  });
});

test('detalle explícito desconocido no se inventa como Detenido', () => {
  verificar([{ subtipo: 'Sin especificar', cantidad: 1 }], 1, {
    detenidos: 0, aprehendidos: 0, totalPersonas: 1,
  });
});

test('total almacenado distinto no reemplaza categorías explícitas', () => {
  verificar([{ subtipo: 'Aprehendido', cantidad: 1 }], 2, {
    detenidos: 0, aprehendidos: 1, totalPersonas: 2,
  });
});

test('exportación Excel conserva las tres columnas sin duplicar categorías', () => {
  const fuenteBuscar = readFileSync(
    new URL('../src/app/allanamientos/buscar/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(fuenteBuscar, /'Total Personas': v\.totalPersonas/);
  assert.match(fuenteBuscar, /'Detenidos': v\.detenidos/);
  assert.match(fuenteBuscar, /'Aprehendidos': v\.aprehendidos/);
  assert.match(fuenteBuscar, /XLSX\.utils\.sheet_add_json\(worksheet, datos/);

  const v = personas([{ subtipo: 'Aprehendido', cantidad: 1 }], 1);
  const hoja = XLSX.utils.json_to_sheet([{
    'Total Personas': v.totalPersonas,
    Detenidos: v.detenidos,
    Aprehendidos: v.aprehendidos,
  }]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Buscar');
  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
  const leido = XLSX.read(buffer, { type: 'buffer' });
  assert.deepEqual(XLSX.utils.sheet_to_json(leido.Sheets.Buscar), [{
    'Total Personas': 1, Detenidos: 0, Aprehendidos: 1,
  }]);
});
