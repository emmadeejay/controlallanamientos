'use server';

import { registrarEventoAuditoria } from '@/lib/auditoria';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { normalizarRolUsuario, perfilTieneAcceso } from '@/lib/usuarios';

type FiltrosExportacionAllanamientos = {
  desde?: string;
  hasta?: string;
  partido?: string;
  superintendencia?: string;
  soloArmas?: boolean;
  soloVehiculos?: boolean;
  soloPersonas?: boolean;
  soloPositivos?: boolean;
  cantidad?: number;
};

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

export async function autorizarExportacionAllanamientosAction(
  filtros: FiltrosExportacionAllanamientos,
) {
  try {
    const supabaseSesion = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabaseSesion.auth.getUser();

    if (userError || !user) {
      return { success: false as const, error: 'La sesión no es válida.' };
    }

    const supabaseAdmin = createAdminClient();
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('profiles')
      .select('rol, activo, estado_cuenta, vigencia_institucional_hasta, email')
      .eq('id', user.id)
      .maybeSingle();

    if (perfilError || !perfil || !perfilTieneAcceso(perfil)) {
      return { success: false as const, error: 'La cuenta no está habilitada.' };
    }

    const rol = normalizarRolUsuario(perfil.rol);
    if (!['administrador', 'supervisor'].includes(rol)) {
      return {
        success: false as const,
        error: 'La exportación de datos está reservada para la oficina de gestión.',
      };
    }

    const textoSeguro = (valor: unknown, maximo: number) =>
      String(valor ?? '').trim().slice(0, maximo);
    const cantidad = Math.max(0, Math.trunc(Number(filtros.cantidad) || 0));
    const detalles = {
      desde: textoSeguro(filtros.desde, 10) || null,
      hasta: textoSeguro(filtros.hasta, 10) || null,
      partido: textoSeguro(filtros.partido, 120) || null,
      superintendencia_id: textoSeguro(filtros.superintendencia, 80) || null,
      solo_armas: filtros.soloArmas === true,
      solo_vehiculos: filtros.soloVehiculos === true,
      solo_personas: filtros.soloPersonas === true,
      solo_positivos: filtros.soloPositivos === true,
      cantidad_registros: cantidad,
    };

    await registrarEventoAuditoria(supabaseAdmin, {
      actor: {
        id: user.id,
        email: perfil.email || user.email || null,
        rol,
      },
      modulo: 'allanamientos',
      accion: 'exportar_allanamientos_excel',
      entidadTipo: 'reporte_allanamientos',
      motivo: 'Exportación institucional solicitada desde Consultas y Reportes',
      detalles,
    });

    return { success: true as const };
  } catch (error) {
    console.error('No se pudo autorizar la exportación de allanamientos.', error);
    return {
      success: false as const,
      error: 'No se pudo autorizar la exportación. Intentá nuevamente.',
    };
  }
}
