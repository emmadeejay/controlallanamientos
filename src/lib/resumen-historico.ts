import * as XLSX from 'xlsx';

export type UnidadHistorica = {
  nombre_fuente: string;
  total_informado: number | null;
  celda_fuente: string;
};

export type ResumenHistoricoPreparado = {
  semana_inicio: string;
  semana_fin: string;
  total_presentado: number;
  archivo_excel: string;
  archivo_pdf: string;
  archivo_excel_sha256: string;
  unidades: UnidadHistorica[];
  sin_informar: string[];
  sin_desglose: boolean;
};

function texto(value: unknown): string {
  return String(value ?? '').trim();
}

function numero(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1500) {
    throw new Error(`${label} debe ser un número entero entre 0 y 1500.`);
  }
  return value;
}

function fechaIso(value: unknown): string {
  const str = texto(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str) || new Date(`${str}T12:00:00Z`).toISOString().slice(0, 10) !== str) {
    throw new Error(`Fecha inválida: ${str || '(vacía)'}.`);
  }
  return str;
}

function sumarDias(iso: string, dias: number): string {
  const fecha = new Date(`${iso}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function hoja(libro: XLSX.WorkBook, nombre: string, cabecera: string[]): unknown[][] {
  const real = libro.SheetNames.find((x) => x === nombre);
  if (!real) throw new Error(`Falta la hoja ${nombre}.`);
  const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[real], {
    header: 1, defval: '', raw: true, blankrows: false,
  });
  if (!filas[0] || cabecera.some((h, i) =>
    texto(filas[0][i]) !== h &&
    !(nombre === 'Semanas' && i === 3 && /^TOTAL FUENTE \([A-Z]{1,3}[1-9][0-9]{0,3}\)$/.test(texto(filas[0][i])))
  )) {
    throw new Error(`Las columnas de ${nombre} no coinciden con la plantilla de resumen.`);
  }
  return filas.slice(1).filter((fila) => fila.some((value) => texto(value)));
}

export async function procesarResumenHistorico(archivo: File): Promise<ResumenHistoricoPreparado> {
  if (!/\.xlsx$/i.test(archivo.name) || /NO_IMPORTAR/i.test(archivo.name)) {
    throw new Error('Seleccioná un resumen semanal aprobado para prevalidar en formato .xlsx.');
  }
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: false });
  const semanas = hoja(libro, 'Semanas', [
    'SEMANA INICIO','SEMANA FIN','TOTAL PDF','CELDA M6','SUMA SUPERINTENDENCIAS',
    'DIFERENCIA','TOTALES VACÍOS','PLANILLA ORIGINAL','INFORME PDF','SHA256 PLANILLA','ESTADO',
  ]).filter((fila) => texto(fila[0]) !== 'TOTAL');
  if (semanas.length !== 1) throw new Error('La carga controlada acepta exactamente una semana por archivo.');
  const row = semanas[0];
  const inicio = fechaIso(row[0]);
  const fin = fechaIso(row[1]);
  if (new Date(`${inicio}T12:00:00Z`).getUTCDay() !== 1 || fin !== sumarDias(inicio, 6)) {
    throw new Error('El período debe ser de lunes a domingo.');
  }
  const total = numero(row[2], 'Total semanal');
  const encabezadoFuente = texto(libro.Sheets['Semanas']?.D1?.v);
  const sinDesglose = encabezadoFuente === 'TOTAL FUENTE (PDF1)';
  if (total === 0 || numero(row[3], 'Total en la fuente') !== total ||
      numero(row[4], 'Suma por superintendencias') !== (sinDesglose ? 0 : total) ||
      numero(row[5], 'Diferencia') !== (sinDesglose ? total : 0) ||
      (sinDesglose && numero(row[6], 'Casilleros vacíos') !== 0)) {
    throw new Error('El total del PDF, la fuente y el desglose declarado no concilian.');
  }
  const hash = texto(row[9]);
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Falta la huella SHA-256 de la planilla original.');
  const fuente = texto(row[7]);
  const pdf = texto(row[8]);
  if (!fuente || !pdf || !/\.xlsx$/i.test(fuente) || !/\.pdf$/i.test(pdf) ||
      fuente.length > 255 || pdf.length > 255) {
    throw new Error('Falta identificar el Excel original y su informe PDF.');
  }
  if (texto(row[10]) !== 'PARA PREVALIDAR') {
    throw new Error('Este archivo no está marcado PARA PREVALIDAR.');
  }

  const datos = hoja(libro, 'Superintendencias', [
    'SEMANA INICIO','SUPERINTENDENCIA TAL COMO FIGURA','TOTAL INFORMADO',
    'CELDA FUENTE','PLANILLA ORIGINAL','ESTADO DATO',
  ]);
  if (datos.length > 100 || (sinDesglose ? datos.length !== 0 : datos.length < 1)) {
    throw new Error('La cantidad de unidades no coincide con la modalidad declarada.');
  }
  const nombres = new Set<string>();
  const unidades = datos.map((fila, i) => {
    const nombre = texto(fila[1]);
    const clave = nombre.toLocaleUpperCase('es-AR');
    const celda = texto(fila[3]);
    if (fechaIso(fila[0]) !== inicio || texto(fila[4]) !== fuente ||
        !nombre || nombre.length > 160 || nombres.has(clave) || !/^C\d{1,4}$/.test(celda)) {
      throw new Error(`Fila ${i+2} de Superintendencias: período, fuente o unidad inválida/repetida.`);
    }
    nombres.add(clave);
    const vacio = texto(fila[2]) === '';
    if (texto(fila[5]) !== (vacio ? 'SIN INFORMAR' : 'INFORMADO')) {
      throw new Error(`Fila ${i+2}: el estado del dato no coincide con la cantidad.`);
    }
    return { nombre_fuente: nombre, total_informado: vacio ? null : numero(fila[2], nombre), celda_fuente: celda };
  });
  if (unidades.reduce((sum, u) => sum + (u.total_informado ?? 0), 0) !== (sinDesglose ? 0 : total) ||
      unidades.filter((u) => u.total_informado === null).length !== numero(row[6], 'Casilleros vacíos')) {
    throw new Error('El desglose por superintendencia no concilia con el encabezado.');
  }
  return {
    semana_inicio: inicio, semana_fin: fin, total_presentado: total,
    archivo_excel: fuente, archivo_pdf: pdf, archivo_excel_sha256: hash,
    unidades, sin_desglose: sinDesglose,
    sin_informar: unidades.filter((u) => u.total_informado === null).map((u) => u.nombre_fuente),
  };
}
