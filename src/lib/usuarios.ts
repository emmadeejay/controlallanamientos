export type EstadoCuenta = 'activo' | 'pausado' | 'deshabilitado';

export type EstadoAcceso = EstadoCuenta | 'validacion_vencida' | 'por_vencer';

export type PerfilVigencia = {
  rol?: string | null;
  activo?: boolean | null;
  estado_cuenta?: string | null;
  vigencia_institucional_hasta?: string | null;
};

const ROLES_ADMINISTRADORES = new Set(['admin', 'administrador']);

export function normalizarRolUsuario(valor: unknown): string {
  const rol = String(valor ?? '').trim().toLowerCase();
  return rol === 'admin' ? 'administrador' : rol;
}

export function fechaHoyArgentina(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';

  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function sumarDiasFecha(fechaIso: string, dias: number): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function diasHastaFecha(fechaIso: string | null | undefined): number | null {
  if (!fechaIso) return null;

  const hoy = fechaHoyArgentina();
  const inicio = Date.parse(`${hoy}T00:00:00Z`);
  const fin = Date.parse(`${fechaIso}T00:00:00Z`);

  if (!Number.isFinite(fin)) return null;
  return Math.ceil((fin - inicio) / 86_400_000);
}

export function evaluarEstadoAcceso(perfil: PerfilVigencia): EstadoAcceso {
  const estado = String(
    perfil.estado_cuenta ?? (perfil.activo === false ? 'pausado' : 'activo'),
  ).toLowerCase() as EstadoCuenta;

  if (estado === 'pausado' || estado === 'deshabilitado') return estado;
  if (perfil.activo === false) return 'pausado';

  const rol = normalizarRolUsuario(perfil.rol);
  if (ROLES_ADMINISTRADORES.has(rol)) return 'activo';

  const dias = diasHastaFecha(perfil.vigencia_institucional_hasta);
  if (dias === null || dias < 0) return 'validacion_vencida';
  if (dias <= 10) return 'por_vencer';
  return 'activo';
}

export function perfilTieneAcceso(perfil: PerfilVigencia): boolean {
  const estado = evaluarEstadoAcceso(perfil);
  return estado === 'activo' || estado === 'por_vencer';
}

export function fechaVigenciaNueva(): string {
  return sumarDiasFecha(fechaHoyArgentina(), 60);
}
