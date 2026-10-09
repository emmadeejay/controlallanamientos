export type DetalleSecuestro = {
  subtipo: string;
  cantidad: number;
};

const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

function fechaArgentina(fecha = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha);

  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';

  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

function sumarDias(fechaIso: string, dias: number): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function obtenerRangoSemanaRendida(fecha = new Date()) {
  const hoy = fechaArgentina(fecha);
  const fechaUtc = new Date(`${hoy}T12:00:00Z`);
  const diaIso = fechaUtc.getUTCDay() === 0 ? 7 : fechaUtc.getUTCDay();
  const lunesActual = sumarDias(hoy, -(diaIso - 1));
  const inicio = sumarDias(lunesActual, -7);

  return {
    hoy,
    inicio,
    fin: sumarDias(inicio, 6),
  };
}

export function validarFechasAllanamiento({
  fechaEjecucion,
  fechaSolicitud,
  esElevado,
}: {
  fechaEjecucion: string;
  fechaSolicitud?: string;
  esElevado: boolean;
}): string | null {
  if (!fechaEjecucion) return 'Debés indicar la fecha de ejecución.';

  const { hoy, inicio, fin } = obtenerRangoSemanaRendida();

  if (fechaEjecucion > hoy) {
    return 'La fecha de ejecución no puede ser posterior a la fecha actual.';
  }

  if (!esElevado && (fechaEjecucion < inicio || fechaEjecucion > fin)) {
    return `El operador sólo puede informar allanamientos ejecutados entre ${inicio} y ${fin}.`;
  }

  if (fechaSolicitud && fechaSolicitud > fechaEjecucion) {
    return 'La fecha de solicitud no puede ser posterior a la fecha de ejecución.';
  }

  return null;
}

export function sanitizarDetalles(detalles: DetalleSecuestro[]): DetalleSecuestro[] {
  return detalles
    .map((detalle) => ({
      subtipo: String(detalle.subtipo ?? '').trim(),
      cantidad: Number(detalle.cantidad),
    }))
    .filter(
      (detalle) =>
        detalle.subtipo.length > 0 &&
        Number.isInteger(detalle.cantidad) &&
        detalle.cantidad > 0 &&
        detalle.cantidad <= 999,
    );
}

export function sumarDetalles(detalles: DetalleSecuestro[]): number {
  return sanitizarDetalles(detalles).reduce(
    (total, detalle) => total + detalle.cantidad,
    0,
  );
}

function numeroSeguro(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

function desglosar(
  valor: unknown,
  aliases: Record<string, string>,
): Record<string, number> {
  const resultado: Record<string, number> = {};

  const agregar = (nombre: unknown, cantidad: unknown) => {
    const claveNormalizada = String(nombre ?? '').trim().toLowerCase();
    const clave = aliases[claveNormalizada] ?? String(nombre ?? '').trim();
    const numero = numeroSeguro(cantidad);

    if (clave && numero > 0) {
      resultado[clave] = (resultado[clave] ?? 0) + numero;
    }
  };

  let contenido = valor;
  if (typeof contenido === 'string') {
    try {
      contenido = JSON.parse(contenido);
    } catch {
      return resultado;
    }
  }

  if (Array.isArray(contenido)) {
    contenido.forEach((elemento) => {
      if (typeof elemento === 'number') {
        agregar('Sin especificar', elemento);
        return;
      }

      if (!elemento || typeof elemento !== 'object') return;

      const item = elemento as Record<string, unknown>;
      const subtipo = item.subtipo ?? item.tipo ?? item.categoria;

      if (subtipo) {
        agregar(subtipo, item.cantidad ?? item.cant ?? 1);
        return;
      }

      Object.entries(item).forEach(([clave, cantidad]) => agregar(clave, cantidad));
    });
  } else if (contenido && typeof contenido === 'object') {
    const item = contenido as Record<string, unknown>;
    const subtipo = item.subtipo ?? item.tipo ?? item.categoria;

    if (subtipo) {
      agregar(subtipo, item.cantidad ?? item.cant ?? 1);
    } else {
      Object.entries(item).forEach(([clave, cantidad]) => agregar(clave, cantidad));
    }
  }

  return resultado;
}

function totalDesglose(desglose: Record<string, number>): number {
  return Object.values(desglose).reduce((total, cantidad) => total + cantidad, 0);
}

export function obtenerValoresSecuestros(item: Record<string, unknown>) {
  const armas = desglosar(item.secuestro_armas, {
    corta: 'Arma Corta',
    'arma corta': 'Arma Corta',
    larga: 'Arma Larga',
    'arma larga': 'Arma Larga',
    blanca: 'Arma Blanca',
    'arma blanca': 'Arma Blanca',
    replica: 'Réplica',
    réplica: 'Réplica',
  });

  const vehiculos = desglosar(item.secuestro_vehiculos, {
    auto: 'Auto',
    autos: 'Auto',
    moto: 'Moto',
    motos: 'Moto',
    camioneta: 'Camioneta',
    camionetas: 'Camioneta',
    otros: 'Otros',
  });

  const personas = desglosar(item.detenidos_aprehendidos, {
    detenido: 'Detenido',
    detenidos: 'Detenido',
    aprehendido: 'Aprehendido',
    aprehendidos: 'Aprehendido',
  });

  const totalArmas =
    numeroSeguro(item.armas_secuestradas) ||
    totalDesglose(armas) ||
    numeroSeguro(item.secuestro_armas);

  const totalVehiculos =
    numeroSeguro(item.vehiculos_secuestrados) ||
    totalDesglose(vehiculos) ||
    numeroSeguro(item.secuestro_vehiculos);

  const totalPersonas =
    numeroSeguro(item.detenidos_aprehendidos_cant) ||
    totalDesglose(personas) ||
    numeroSeguro(item.detenidos_aprehendidos);

  return {
    corta: armas['Arma Corta'] ?? 0,
    larga: armas['Arma Larga'] ?? 0,
    blanca: armas['Arma Blanca'] ?? 0,
    replica: armas['Réplica'] ?? 0,
    totalArmas,
    autos: vehiculos.Auto ?? 0,
    motos: vehiculos.Moto ?? 0,
    camionetas: vehiculos.Camioneta ?? 0,
    otrosVeh: vehiculos.Otros ?? 0,
    totalVehiculos,
    detenidos: personas.Detenido ?? totalPersonas,
    aprehendidos: personas.Aprehendido ?? 0,
    totalPersonas,
  };
}
