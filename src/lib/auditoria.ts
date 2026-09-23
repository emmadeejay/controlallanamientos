import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

type ActorAuditoria = {
  id: string;
  email?: string | null;
  rol?: string | null;
};

type EventoAuditoria = {
  actor: ActorAuditoria;
  modulo: string;
  accion: string;
  entidadTipo: string;
  entidadId?: string | null;
  superintendenciaId?: string | null;
  superintendenciaNombre?: string | null;
  motivo?: string | null;
  referenciaDocumental?: string | null;
  detalles?: Record<string, unknown>;
};

/**
 * Registra eventos originados por Server Actions que usan service_role.
 * Nunca incluir contrasenas, tokens, cookies ni cuerpos completos de correos.
 */
export async function registrarEventoAuditoria(
  supabaseAdmin: SupabaseClient,
  evento: EventoAuditoria,
) {
  let superintendenciaNombre = evento.superintendenciaNombre || null;

  if (!superintendenciaNombre && evento.superintendenciaId) {
    const { data, error: superintendenciaError } = await supabaseAdmin
      .from('superintendencias')
      .select('nombre')
      .eq('id', evento.superintendenciaId)
      .maybeSingle();

    if (superintendenciaError) {
      console.error('No se pudo resolver la superintendencia del evento de auditoria.', {
        superintendenciaId: evento.superintendenciaId,
        error: superintendenciaError.message,
      });
    } else {
      superintendenciaNombre = data?.nombre || null;
    }
  }

  const { error } = await supabaseAdmin.from('auditoria_eventos').insert({
    actor_id: evento.actor.id,
    actor_email: evento.actor.email || 'sin-email',
    actor_rol: evento.actor.rol || 'desconocido',
    modulo: evento.modulo,
    accion: evento.accion,
    entidad_tipo: evento.entidadTipo,
    entidad_id: evento.entidadId || null,
    superintendencia_id: evento.superintendenciaId || null,
    superintendencia_nombre: superintendenciaNombre,
    resultado: 'exitoso',
    motivo: evento.motivo || null,
    referencia_documental: evento.referenciaDocumental || null,
    detalles: evento.detalles || {},
  });

  // La accion principal ya se completo. El error queda en logs del servidor
  // para no repetir una operacion sensible por un fallo transitorio de auditoria.
  if (error) {
    console.error('No se pudo registrar el evento de auditoria.', {
      accion: evento.accion,
      entidadTipo: evento.entidadTipo,
      entidadId: evento.entidadId,
      error: error.message,
    });
  }
}
