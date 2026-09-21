'use server';

/**
 * Esta acción privilegiada estaba sin uso y aceptaba un userId enviado por el
 * navegador. Se mantiene temporalmente como bloqueo explícito para que ninguna
 * llamada antigua pueda usar service_role ni omitir RLS.
 *
 * El alta vigente continúa en /allanamientos/nuevo y queda protegida por las
 * policies de la Fase 01. En la fase transaccional se reemplazará por una RPC.
 */
export async function crearAllanamientoAction() {
  return {
    success: false as const,
    error: 'Esta vía de alta fue deshabilitada por seguridad.',
  };
}
