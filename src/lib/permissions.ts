// lib/permissions.ts
import { esVentanaOperativaValida } from './allanamientos';

export function puedeEditarAllanamiento(rolUsuario: string): boolean {
  // Administradores y Supervisores editan siempre
  if (rolUsuario === 'administrador' || rolUsuario === 'supervisor') {
    return true;
  }

  return esVentanaOperativaValida();
}
