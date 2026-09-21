// lib/permissions.ts
export function puedeEditarAllanamiento(rolUsuario: string): boolean {
  // Administradores y Supervisores editan siempre
  if (rolUsuario === 'administrador' || rolUsuario === 'supervisor') {
    return true;
  }

  // Validación para Operadores
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(ahora);
  const dia = partes.find((parte) => parte.type === 'weekday')?.value;
  const hora = Number(partes.find((parte) => parte.type === 'hour')?.value ?? 24);

  // Lunes completo desde las 00:00 hs
  if (dia === 'Mon') return true;
  // Martes todo el día
  if (dia === 'Tue') return true;
  // Miércoles antes de las 08:00 hs
  if (dia === 'Wed' && hora < 8) return true;

  return false;
}
