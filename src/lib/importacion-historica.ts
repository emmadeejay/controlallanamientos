import * as XLSX from 'xlsx';

export type SuperintendenciaImportacion = {
  id: string;
  nombre: string;
};

export type DetalleImportado = {
  subtipo: string;
  cantidad: number;
};

export type ColaboracionImportada = {
  especialidad: string;
  cant_solicitada: number;
  cant_afectada: number;
};

export type FilaImportacionHistorica = {
  registro_id: string;
  superintendencia_id: string;
  superintendencia_nombre: string;
  numero_ipp: string;
  caratula: string;
  ufi_juzgado: string;
  fecha_solicitud: string | null;
  fecha_ejecucion: string;
  horario_ejecucion: string;
  partido: string;
  lugar_presentacion: string;
  departamental: string | null;
  dependencia: string;
  objetivos: number;
  personal_propio: number;
  resultado_medida: 'Positivo' | 'Negativo';
  resultado_secuestros: 'Positivo' | 'Negativo';
  secuestro_armas: DetalleImportado[];
  secuestro_vehiculos: DetalleImportado[];
  detenidos_aprehendidos: DetalleImportado[];
  colaboraciones: ColaboracionImportada[];
  orden_servicio_propia: string | null;
  orden_servicio_cop: string | null;
  numero_parte_urgente: string | null;
  observaciones: string | null;
  hoja_origen: string;
  fila_origen: number;
  confirmar_advertencia?: boolean;
  motivo_confirmacion?: string;
};

export type RevisionImportacionHistorica = {
  indice: number;
  fila_origen: number;
  estado: 'apto' | 'advertencia' | 'error';
  errores: string[];
  advertencias: string[];
  coincidencias_probables: number;
  huella_contenido: string;
};

type FilaCruda = {
  numeroExcel: number;
  valores: Record<string, unknown>;
};

const CABECERAS_ALLANAMIENTOS = [
  'REGISTRO_ID',
  'SUPERINTENDENCIA',
  'NRO_IPP_CAUSA',
  'CARATULA',
  'UFI_JUZGADO',
  'FECHA_SOLICITUD',
  'FECHA_EJECUCION',
  'HORA_EJECUCION',
  'PARTIDO',
  'LUGAR_PRESENTACION',
  'DEPARTAMENTAL',
  'DEPENDENCIA',
  'OBJETIVOS',
  'PERSONAL_PROPIO',
  'RESULTADO_MEDIDA',
  'RESULTADO_SECUESTROS',
  'NRO_OS_PROPIA',
  'NRO_OS_COP',
  'NRO_PARTE_URGENTE',
  'OBSERVACIONES',
  'HOJA_ORIGEN',
  'FILA_ORIGEN',
];

const CABECERAS_COLABORACIONES = [
  'REGISTRO_ID',
  'ESPECIALIDAD',
  'CANT_SOLICITADA',
  'CANT_AFECTADA',
];

const CABECERAS_SECUESTROS = [
  'REGISTRO_ID',
  'CATEGORIA',
  'SUBTIPO',
  'CANTIDAD',
];

function clave(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function texto(valor: unknown): string {
  return String(valor ?? '').replace(/\s+/g, ' ').trim();
}

function textoOpcional(valor: unknown): string | null {
  const resultado = texto(valor);
  return resultado || null;
}

function enteroNoNegativo(valor: unknown, campo: string, fila: number): number {
  if (valor === '' || valor === null || valor === undefined) return 0;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0 || numero > 99999) {
    throw new Error(`Fila ${fila}: ${campo} debe ser un número entero no negativo.`);
  }
  return numero;
}

function fechaIso(valor: unknown, campo: string, fila: number, opcional = false): string | null {
  if (valor === '' || valor === null || valor === undefined) {
    if (opcional) return null;
    throw new Error(`Fila ${fila}: falta ${campo}.`);
  }

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const anio = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const dia = String(valor.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  if (typeof valor === 'number') {
    const partes = XLSX.SSF.parse_date_code(valor);
    if (partes) {
      return `${String(partes.y).padStart(4, '0')}-${String(partes.m).padStart(2, '0')}-${String(partes.d).padStart(2, '0')}`;
    }
  }

  const crudo = texto(valor);
  const iso = crudo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const argentina = crudo.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const resultado = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : argentina
      ? `${argentina[3]}-${argentina[2].padStart(2, '0')}-${argentina[1].padStart(2, '0')}`
      : null;

  if (!resultado || Number.isNaN(new Date(`${resultado}T12:00:00Z`).getTime())) {
    throw new Error(`Fila ${fila}: ${campo} no es una fecha válida.`);
  }

  return resultado;
}

function hora24(valor: unknown, fila: number): string {
  if (valor === '' || valor === null || valor === undefined) return '';

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${String(valor.getHours()).padStart(2, '0')}:${String(valor.getMinutes()).padStart(2, '0')}`;
  }

  if (typeof valor === 'number') {
    const partes = XLSX.SSF.parse_date_code(valor);
    if (partes) {
      return `${String(partes.H).padStart(2, '0')}:${String(partes.M).padStart(2, '0')}`;
    }
  }

  const crudo = texto(valor).toLowerCase().replace(/\s*hs?\.?$/, '');
  const coincidencia = crudo.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!coincidencia) throw new Error(`Fila ${fila}: HORA_EJECUCION no es válida.`);

  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2] ?? 0);
  if (horas > 23 || minutos > 59) {
    throw new Error(`Fila ${fila}: HORA_EJECUCION no es válida.`);
  }
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

function resultado(valor: unknown, campo: string, fila: number): 'Positivo' | 'Negativo' {
  const normalizado = clave(valor);
  if (normalizado === 'POSITIVO') return 'Positivo';
  if (normalizado === 'NEGATIVO') return 'Negativo';
  throw new Error(`Fila ${fila}: ${campo} debe ser Positivo o Negativo.`);
}

function leerHoja(
  libro: XLSX.WorkBook,
  nombre: string,
  cabecerasObligatorias: string[],
  opcional = false,
): FilaCruda[] {
  const nombreReal = libro.SheetNames.find((hoja) => clave(hoja) === clave(nombre));
  if (!nombreReal) {
    if (opcional) return [];
    throw new Error(`El archivo no contiene la hoja obligatoria “${nombre}”.`);
  }

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombreReal], {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });
  if (matriz.length === 0) return [];

  const cabeceras = matriz[0].map(clave);
  const faltantes = cabecerasObligatorias.filter(
    (cabecera) => !cabeceras.includes(clave(cabecera)),
  );
  if (faltantes.length > 0) {
    throw new Error(`Hoja ${nombre}: faltan columnas: ${faltantes.join(', ')}.`);
  }

  return matriz.slice(1).flatMap((fila, indice) => {
    if (fila.every((celda) => texto(celda) === '')) return [];
    const valores = Object.fromEntries(
      cabeceras.map((cabecera, posicion) => [cabecera, fila[posicion] ?? '']),
    );
    return [{ numeroExcel: indice + 2, valores }];
  });
}

function valor(fila: FilaCruda, cabecera: string): unknown {
  return fila.valores[clave(cabecera)] ?? '';
}

function agregarDetalle(
  mapa: Map<string, DetalleImportado[]>,
  registroId: string,
  detalle: DetalleImportado,
) {
  const existentes = mapa.get(registroId) ?? [];
  existentes.push(detalle);
  mapa.set(registroId, existentes);
}

function normalizarCategoria(valor: unknown, fila: number): 'ARMA' | 'VEHICULO' | 'PERSONA' {
  const categoria = clave(valor);
  if (['ARMA', 'ARMAS'].includes(categoria)) return 'ARMA';
  if (['VEHICULO', 'VEHICULOS'].includes(categoria)) return 'VEHICULO';
  if (['PERSONA', 'PERSONAS', 'DETENIDO', 'DETENIDOS'].includes(categoria)) return 'PERSONA';
  throw new Error(`Fila ${fila} de Secuestros: categoría desconocida “${texto(valor)}”.`);
}

export async function sha256Archivo(archivo: File): Promise<string> {
  const contenido = await archivo.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', contenido);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function procesarPlantillaHistorica(
  archivo: File,
  superintendencias: SuperintendenciaImportacion[],
): Promise<FilaImportacionHistorica[]> {
  const libro = XLSX.read(await archivo.arrayBuffer(), {
    type: 'array',
    cellDates: true,
  });

  const filasPrincipales = leerHoja(libro, 'Allanamientos', CABECERAS_ALLANAMIENTOS);
  const filasColaboraciones = leerHoja(
    libro,
    'Colaboraciones',
    CABECERAS_COLABORACIONES,
    true,
  );
  const filasSecuestros = leerHoja(libro, 'Secuestros', CABECERAS_SECUESTROS, true);

  if (filasPrincipales.length === 0) {
    throw new Error('La hoja Allanamientos no contiene registros.');
  }
  if (filasPrincipales.length > 1500) {
    throw new Error('Una semana no puede superar 1500 allanamientos en un lote.');
  }

  const mapaSupers = new Map(
    superintendencias.map((superintendencia) => [clave(superintendencia.nombre), superintendencia]),
  );
  const idsPrincipales = new Set<string>();
  const armas = new Map<string, DetalleImportado[]>();
  const vehiculos = new Map<string, DetalleImportado[]>();
  const personas = new Map<string, DetalleImportado[]>();
  const colaboraciones = new Map<string, ColaboracionImportada[]>();

  for (const fila of filasPrincipales) {
    const registroId = texto(valor(fila, 'REGISTRO_ID'));
    if (!registroId) throw new Error(`Fila ${fila.numeroExcel}: falta REGISTRO_ID.`);
    if (idsPrincipales.has(registroId)) {
      throw new Error(`Fila ${fila.numeroExcel}: REGISTRO_ID “${registroId}” está repetido.`);
    }
    idsPrincipales.add(registroId);
  }

  for (const fila of filasSecuestros) {
    const registroId = texto(valor(fila, 'REGISTRO_ID'));
    if (!idsPrincipales.has(registroId)) {
      throw new Error(`Fila ${fila.numeroExcel} de Secuestros: REGISTRO_ID inexistente “${registroId}”.`);
    }
    const categoria = normalizarCategoria(valor(fila, 'CATEGORIA'), fila.numeroExcel);
    const subtipo = texto(valor(fila, 'SUBTIPO'));
    if (!subtipo) throw new Error(`Fila ${fila.numeroExcel} de Secuestros: falta SUBTIPO.`);
    const detalle = {
      subtipo,
      cantidad: enteroNoNegativo(valor(fila, 'CANTIDAD'), 'CANTIDAD', fila.numeroExcel),
    };
    if (detalle.cantidad === 0) continue;
    if (categoria === 'ARMA') agregarDetalle(armas, registroId, detalle);
    if (categoria === 'VEHICULO') agregarDetalle(vehiculos, registroId, detalle);
    if (categoria === 'PERSONA') agregarDetalle(personas, registroId, detalle);
  }

  for (const fila of filasColaboraciones) {
    const registroId = texto(valor(fila, 'REGISTRO_ID'));
    if (!idsPrincipales.has(registroId)) {
      throw new Error(`Fila ${fila.numeroExcel} de Colaboraciones: REGISTRO_ID inexistente “${registroId}”.`);
    }
    const especialidad = texto(valor(fila, 'ESPECIALIDAD'));
    if (!especialidad) {
      throw new Error(`Fila ${fila.numeroExcel} de Colaboraciones: falta ESPECIALIDAD.`);
    }
    const existentes = colaboraciones.get(registroId) ?? [];
    existentes.push({
      especialidad,
      cant_solicitada: enteroNoNegativo(
        valor(fila, 'CANT_SOLICITADA'),
        'CANT_SOLICITADA',
        fila.numeroExcel,
      ),
      cant_afectada: enteroNoNegativo(
        valor(fila, 'CANT_AFECTADA'),
        'CANT_AFECTADA',
        fila.numeroExcel,
      ),
    });
    colaboraciones.set(registroId, existentes);
  }

  return filasPrincipales.map((fila) => {
    const registroId = texto(valor(fila, 'REGISTRO_ID'));
    const nombreSuper = texto(valor(fila, 'SUPERINTENDENCIA'));
    const superintendencia = mapaSupers.get(clave(nombreSuper));
    if (!superintendencia) {
      throw new Error(
        `Fila ${fila.numeroExcel}: la superintendencia “${nombreSuper || '(vacía)'}” no coincide con el padrón del sistema.`,
      );
    }

    const detallesArmas = armas.get(registroId) ?? [];
    const detallesVehiculos = vehiculos.get(registroId) ?? [];
    const detallesPersonas = personas.get(registroId) ?? [];
    const tieneSecuestros =
      detallesArmas.length + detallesVehiculos.length + detallesPersonas.length > 0;
    const resultadoSecuestros = resultado(
      valor(fila, 'RESULTADO_SECUESTROS'),
      'RESULTADO_SECUESTROS',
      fila.numeroExcel,
    );
    if (resultadoSecuestros === 'Negativo' && tieneSecuestros) {
      throw new Error(
        `Fila ${fila.numeroExcel}: RESULTADO_SECUESTROS es Negativo pero existen detalles en la hoja Secuestros.`,
      );
    }
    const filaOrigen = enteroNoNegativo(
      valor(fila, 'FILA_ORIGEN'),
      'FILA_ORIGEN',
      fila.numeroExcel,
    );

    return {
      registro_id: registroId,
      superintendencia_id: superintendencia.id,
      superintendencia_nombre: superintendencia.nombre,
      numero_ipp: texto(valor(fila, 'NRO_IPP_CAUSA')),
      caratula: texto(valor(fila, 'CARATULA')),
      ufi_juzgado: texto(valor(fila, 'UFI_JUZGADO')) || 'Sin especificar',
      fecha_solicitud: fechaIso(
        valor(fila, 'FECHA_SOLICITUD'),
        'FECHA_SOLICITUD',
        fila.numeroExcel,
        true,
      ),
      fecha_ejecucion: fechaIso(
        valor(fila, 'FECHA_EJECUCION'),
        'FECHA_EJECUCION',
        fila.numeroExcel,
      )!,
      horario_ejecucion: hora24(valor(fila, 'HORA_EJECUCION'), fila.numeroExcel),
      partido: texto(valor(fila, 'PARTIDO')),
      lugar_presentacion:
        texto(valor(fila, 'LUGAR_PRESENTACION')) || texto(valor(fila, 'DEPENDENCIA')),
      departamental: textoOpcional(valor(fila, 'DEPARTAMENTAL')),
      dependencia: texto(valor(fila, 'DEPENDENCIA')) || 'Sin especificar',
      objetivos: enteroNoNegativo(valor(fila, 'OBJETIVOS'), 'OBJETIVOS', fila.numeroExcel),
      personal_propio: enteroNoNegativo(
        valor(fila, 'PERSONAL_PROPIO'),
        'PERSONAL_PROPIO',
        fila.numeroExcel,
      ),
      resultado_medida: resultado(
        valor(fila, 'RESULTADO_MEDIDA'),
        'RESULTADO_MEDIDA',
        fila.numeroExcel,
      ),
      resultado_secuestros: resultadoSecuestros,
      secuestro_armas: detallesArmas,
      secuestro_vehiculos: detallesVehiculos,
      detenidos_aprehendidos: detallesPersonas,
      colaboraciones: colaboraciones.get(registroId) ?? [],
      orden_servicio_propia: textoOpcional(valor(fila, 'NRO_OS_PROPIA')),
      orden_servicio_cop: textoOpcional(valor(fila, 'NRO_OS_COP')),
      numero_parte_urgente: textoOpcional(valor(fila, 'NRO_PARTE_URGENTE')),
      observaciones: textoOpcional(valor(fila, 'OBSERVACIONES')),
      hoja_origen: texto(valor(fila, 'HOJA_ORIGEN')) || 'Allanamientos',
      fila_origen: filaOrigen || fila.numeroExcel,
    };
  });
}

export function descargarPlantillaHistorica() {
  const libro = XLSX.utils.book_new();
  const instrucciones = XLSX.utils.aoa_to_sheet([
    ['PLANTILLA DE IMPORTACIÓN HISTÓRICA DE ALLANAMIENTOS'],
    ['Una plantilla por semana (lunes a domingo). No elimine ni renombre las columnas.'],
    ['REGISTRO_ID vincula un allanamiento con sus colaboraciones y secuestros. Debe ser único dentro del archivo.'],
    ['Las fechas admiten AAAA-MM-DD o DD/MM/AAAA. Se recomienda AAAA-MM-DD.'],
    ['NRO_OS_PROPIA conserva números o el texto URGENCIA. NRO_OS_COP puede quedar vacío.'],
    ['No use una fila por cada secuestro en Allanamientos: cargue el detalle en la hoja Secuestros.'],
    ['HOJA_ORIGEN y FILA_ORIGEN identifican la ubicación en la planilla institucional anterior.'],
  ]);

  const allanamientos = XLSX.utils.aoa_to_sheet([
    CABECERAS_ALLANAMIENTOS,
    [
      'REG-0001',
      'SUPERINTENDENCIA DE SEGURIDAD REGIONAL AMBA NORTE I',
      '00-000001-26',
      'EJEMPLO',
      'UFI N° 1',
      '2026-06-01',
      '2026-06-03',
      '07:30',
      'SAN ISIDRO',
      'DOMICILIO INFORMADO',
      'SAN ISIDRO',
      'COMISARÍA EJEMPLO',
      1,
      4,
      'Positivo',
      'Positivo',
      'URGENCIA',
      '',
      '',
      'Fila de ejemplo: eliminar antes de usar.',
      'AMBA NORTE I',
      9,
    ],
  ]);
  const colaboraciones = XLSX.utils.aoa_to_sheet([
    CABECERAS_COLABORACIONES,
    ['REG-0001', 'F.O.E. - G.A.D', 4, 3],
  ]);
  const secuestros = XLSX.utils.aoa_to_sheet([
    CABECERAS_SECUESTROS,
    ['REG-0001', 'ARMA', 'Arma Corta', 1],
    ['REG-0001', 'VEHICULO', 'Auto', 1],
    ['REG-0001', 'PERSONA', 'Detenido', 1],
  ]);

  instrucciones['!cols'] = [{ wch: 110 }];
  allanamientos['!cols'] = CABECERAS_ALLANAMIENTOS.map(() => ({ wch: 24 }));
  colaboraciones['!cols'] = CABECERAS_COLABORACIONES.map(() => ({ wch: 24 }));
  secuestros['!cols'] = CABECERAS_SECUESTROS.map(() => ({ wch: 24 }));

  XLSX.utils.book_append_sheet(libro, instrucciones, 'Instrucciones');
  XLSX.utils.book_append_sheet(libro, allanamientos, 'Allanamientos');
  XLSX.utils.book_append_sheet(libro, colaboraciones, 'Colaboraciones');
  XLSX.utils.book_append_sheet(libro, secuestros, 'Secuestros');
  XLSX.writeFile(libro, 'Plantilla_Importacion_Historica_Allanamientos.xlsx');
}
