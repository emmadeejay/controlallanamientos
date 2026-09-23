type SerieInforme = {
  name?: string;
  total?: number;
};

type EspecialidadInforme = {
  name?: string;
  servicios?: number;
  personal?: number;
};

type PresentacionesInforme = {
  total_superintendencias?: number;
  finalizadas?: number;
  sin_novedades?: number;
  por_gestion?: number;
};

type ApoyoOperativoInforme = {
  sin_apoyo?: number;
  con_apoyo?: number;
};

type ComparacionInforme = {
  total_anterior?: number;
  variacion_porcentual?: number | null;
};

type MetadatosConsolidacion = {
  referencia_documental?: string | null;
};

export type ConsolidacionInformeSemanal = {
  id: string;
  semana_inicio: string;
  semana_fin: string;
  version: number;
  fuente_sha256: string;
  consolidada_at: string;
  datos: Record<string, unknown>;
};

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function fechaArgentina(valor: string): string {
  const [anio, mes, dia] = valor.slice(0, 10).split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : valor;
}

function fechaHoraArgentina(valor: string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(fecha);
}

function serie(valor: unknown): SerieInforme[] {
  return Array.isArray(valor) ? (valor as SerieInforme[]) : [];
}

function especialidades(valor: unknown): EspecialidadInforme[] {
  return Array.isArray(valor) ? (valor as EspecialidadInforme[]) : [];
}

function objetoNumerico(valor: unknown): Array<[string, number]> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return [];
  return Object.entries(valor as Record<string, unknown>)
    .map(([nombre, total]) => [nombre, numero(total)] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
}

function descripcionVariacion(comparacion: ComparacionInforme): string {
  const anterior = numero(comparacion.total_anterior);
  const variacion = comparacion.variacion_porcentual;
  if (!anterior || variacion === null || variacion === undefined) {
    return 'No se calcula variación porcentual porque la semana anterior no registra procedimientos.';
  }
  if (numero(variacion) === 0) {
    return `La actividad se mantuvo sin variaciones respecto de la semana anterior (${anterior} procedimientos).`;
  }
  const cambio = numero(variacion) > 0 ? 'un aumento' : 'una disminución';
  return `La actividad registró ${cambio} del ${Math.abs(numero(variacion)).toLocaleString('es-AR')}% respecto de la semana anterior (${anterior} procedimientos).`;
}

export async function crearInformeSemanalPdf(
  consolidacion: ConsolidacionInformeSemanal,
) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const datos = consolidacion.datos ?? {};
  const presentaciones = (datos.presentaciones ?? {}) as PresentacionesInforme;
  const apoyo = (datos.apoyo_operativo ?? {}) as ApoyoOperativoInforme;
  const comparacion = (datos.comparacion_anterior ?? {}) as ComparacionInforme;
  const metadatos = (datos.consolidacion ?? {}) as MetadatosConsolidacion;
  const azul: [number, number, number] = [2, 132, 199];
  const azulOscuro: [number, number, number] = [15, 23, 42];
  const celeste: [number, number, number] = [224, 242, 254];
  const gris: [number, number, number] = [71, 85, 105];

  function encabezado(titulo: string) {
    doc.setFillColor(...azulOscuro);
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DIRECCIÓN CENTRO DE OPERACIONES POLICIALES', 14, 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Oficina de Estadísticas', 14, 16);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(titulo, 196, 13, { align: 'right' });
    doc.setTextColor(15, 23, 42);
  }

  function tituloSeccion(titulo: string, y: number) {
    doc.setFillColor(...celeste);
    doc.roundedRect(14, y - 5, 182, 9, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...azulOscuro);
    doc.text(titulo, 17, y + 1);
  }

  encabezado('INFORME SEMANAL CONSOLIDADO');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Informe estadístico de allanamientos', 14, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...gris);
  doc.text(
    `Período: ${fechaArgentina(consolidacion.semana_inicio)} al ${fechaArgentina(consolidacion.semana_fin)}`,
    14,
    45,
  );
  doc.text(`Versión oficial: ${consolidacion.version}`, 196, 45, { align: 'right' });

  doc.setTextColor(...azulOscuro);
  doc.setFontSize(9.5);
  const introduccion =
    `Se eleva a la Superioridad el informe estadístico consolidado de los allanamientos ` +
    `ejecutados en el ámbito de la Provincia de Buenos Aires durante el período indicado. ` +
    `La información fue cerrada por ${numero(presentaciones.finalizadas)} de ` +
    `${numero(presentaciones.total_superintendencias)} superintendencias obligadas y se presenta sin valoraciones subjetivas.`;
  doc.text(doc.splitTextToSize(introduccion, 182), 14, 56, { lineHeightFactor: 1.35 });

  autoTable(doc, {
    startY: 77,
    head: [['Métrica principal', 'Resultado']],
    body: [
      ['Allanamientos / servicios', numero(datos.rendicion_semanal)],
      ['Efectividad de las medidas', `${numero(datos.efectividad)}%`],
      ['Armas secuestradas', numero(datos.armas_semana)],
      ['Vehículos secuestrados', numero(datos.vehiculos_semana)],
      ['Detenidos / aprehendidos', numero(datos.personas_semana)],
      ['Personal propio afectado', numero(datos.personal_propio_total)],
    ],
    theme: 'grid',
    headStyles: { fillColor: azul, textColor: 255, fontStyle: 'bold' },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });

  tituloSeccion('Comparación semanal', (doc as any).lastAutoTable.finalY + 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...gris);
  doc.text(
    doc.splitTextToSize(descripcionVariacion(comparacion), 176),
    17,
    (doc as any).lastAutoTable.finalY + 20,
    { lineHeightFactor: 1.3 },
  );

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 32,
    head: [['Control de presentación', 'Cantidad']],
    body: [
      ['Superintendencias obligadas', numero(presentaciones.total_superintendencias)],
      ['Rendiciones finalizadas', numero(presentaciones.finalizadas)],
      ['Presentaciones sin novedades', numero(presentaciones.sin_novedades)],
      ['Finalizaciones por gestión', numero(presentaciones.por_gestion)],
    ],
    theme: 'grid',
    headStyles: { fillColor: azulOscuro, textColor: 255, fontStyle: 'bold' },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });

  doc.addPage();
  encabezado('DISTRIBUCIÓN OPERATIVA');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Principales resultados del período', 14, 36);

  autoTable(doc, {
    startY: 43,
    head: [['Orden', 'Superintendencia interviniente', 'Servicios']],
    body: serie(datos.superintendencias)
      .slice(0, 10)
      .map((item, indice) => [indice + 1, String(item.name ?? 'Sin especificar'), numero(item.total)]),
    theme: 'striped',
    headStyles: { fillColor: azul, textColor: 255 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 16 },
      2: { halign: 'right', cellWidth: 27, fontStyle: 'bold' },
    },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 9,
    head: [['Orden', 'Partido', 'Servicios']],
    body: serie(datos.partidos_top10 ?? datos.partidos)
      .slice(0, 10)
      .map((item, indice) => [indice + 1, String(item.name ?? 'Sin especificar'), numero(item.total)]),
    theme: 'striped',
    headStyles: { fillColor: azulOscuro, textColor: 255 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 16 },
      2: { halign: 'right', cellWidth: 27, fontStyle: 'bold' },
    },
  });

  doc.addPage();
  encabezado('APOYO OPERATIVO');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Demanda de unidades y personal de colaboración', 14, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...gris);
  const textoApoyo =
    `De los ${numero(datos.rendicion_semanal)} servicios informados, ` +
    `${numero(apoyo.sin_apoyo)} se ejecutaron sin apoyo especializado y ` +
    `${numero(apoyo.con_apoyo)} registraron al menos una colaboración.`;
  doc.text(doc.splitTextToSize(textoApoyo, 182), 14, 45, { lineHeightFactor: 1.3 });

  autoTable(doc, {
    startY: 58,
    head: [['Orden', 'Especialidad', 'Servicios', 'Personal afectado']],
    body: especialidades(datos.especialidades_servicios)
      .slice(0, 10)
      .map((item, indice) => [
        indice + 1,
        String(item.name ?? 'Sin especificar'),
        numero(item.servicios),
        numero(item.personal),
      ]),
    theme: 'striped',
    headStyles: { fillColor: azul, textColor: 255 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 16 },
      2: { halign: 'right', cellWidth: 27 },
      3: { halign: 'right', cellWidth: 34, fontStyle: 'bold' },
    },
  });

  tituloSeccion('Lectura institucional', (doc as any).lastAutoTable.finalY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...gris);
  doc.text(
    doc.splitTextToSize(
      'El desglose permite identificar la demanda real de apoyo operativo y el personal especializado afectado, evitando confundir cantidad de servicios con cantidad de efectivos.',
      176,
    ),
    17,
    (doc as any).lastAutoTable.finalY + 21,
    { lineHeightFactor: 1.35 },
  );

  doc.addPage();
  encabezado('SECUESTROS Y RESULTADOS');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Desglose consolidado', 14, 36);

  const desgloses: Array<[string, unknown]> = [
    ['Armas', datos.desglose_armas],
    ['Vehículos', datos.desglose_vehiculos],
    ['Personas', datos.desglose_personas],
  ];
  let inicioY = 43;
  for (const [titulo, valores] of desgloses) {
    const filas = objetoNumerico(valores);
    autoTable(doc, {
      startY: inicioY,
      head: [[titulo, 'Cantidad']],
      body: filas.length > 0 ? filas.map(([nombre, total]) => [nombre, total]) : [['Sin registros', 0]],
      theme: 'grid',
      headStyles: { fillColor: azulOscuro, textColor: 255 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 1: { halign: 'right', cellWidth: 35, fontStyle: 'bold' } },
    });
    inicioY = (doc as any).lastAutoTable.finalY + 8;
  }

  tituloSeccion('Trazabilidad del informe', inicioY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...gris);
  const yTrazabilidad = inicioY + 13;
  doc.text(`Consolidado: ${fechaHoraArgentina(consolidacion.consolidada_at)}`, 17, yTrazabilidad);
  doc.text(`Versión: ${consolidacion.version}`, 17, yTrazabilidad + 5);
  if (metadatos.referencia_documental) {
    doc.text(`Referencia: ${metadatos.referencia_documental}`, 17, yTrazabilidad + 10);
  }
  doc.text('Huella SHA-256 de la fuente:', 17, yTrazabilidad + 15);
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.2);
  doc.text(consolidacion.fuente_sha256, 17, yTrazabilidad + 20);

  const totalPaginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setDrawColor(203, 213, 225);
    doc.line(14, 282, 196, 282);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...gris);
    doc.text('Oficina de Estadísticas - Dirección Centro de Operaciones Policiales', 14, 288);
    doc.text(`Página ${pagina} de ${totalPaginas}`, 196, 288, { align: 'right' });
  }

  return doc;
}

export async function descargarInformeSemanalPdf(
  consolidacion: ConsolidacionInformeSemanal,
) {
  const doc = await crearInformeSemanalPdf(consolidacion);
  doc.save(
    `informe_allanamientos_${consolidacion.semana_inicio}_${consolidacion.semana_fin}_v${consolidacion.version}.pdf`,
  );
}
