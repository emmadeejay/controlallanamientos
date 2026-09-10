// lib/permissions.ts
export function puedeEditarAllanamiento(rolUsuario: string): boolean {
  // Administradores y Supervisores editan siempre
  if (rolUsuario === 'administrador' || rolUsuario === 'supervisor') {
    return true;
  }

  // Validación para Operadores
  const ahora = new Date();
  const diaSemana = ahora.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb
  const hora = ahora.getHours();

  // Lunes a partir de las 08:00 hs
  if (diaSemana === 1 && hora >= 8) return true;
  // Martes todo el día
  if (diaSemana === 2) return true;
  // Miércoles antes de las 08:00 hs
  if (diaSemana === 3 && hora < 8) return true;

  return false;
}