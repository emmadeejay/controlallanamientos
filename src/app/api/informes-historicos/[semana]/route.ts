import { createHash } from 'node:crypto';
import { registrarEventoAuditoria } from '@/lib/auditoria';
import { informeHistoricoPorSemana } from '@/lib/informes-historicos';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { normalizarRolUsuario, perfilTieneAcceso } from '@/lib/usuarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'cop-informes-historicos';
const SIN_CACHE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

function errorJson(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: SIN_CACHE });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ semana: string }> },
) {
  try {
    const sesion = await createClient();
    const { data: { user }, error: sesionError } = await sesion.auth.getUser();
    if (sesionError || !user) return errorJson(401, 'Iniciá sesión para descargar el informe.');

    const admin = createAdminClient();
    const { data: perfil, error: perfilError } = await admin.from('profiles')
      .select('rol, activo, estado_cuenta, vigencia_institucional_hasta, requiere_cambio_clave, modulos_permitidos, email')
      .eq('id', user.id).maybeSingle();
    if (perfilError || !perfil || !perfilTieneAcceso(perfil) || perfil.requiere_cambio_clave === true) {
      return errorJson(403, 'Tu cuenta no está habilitada para descargar este informe.');
    }
    const rol = normalizarRolUsuario(perfil.rol);
    if (!['administrador', 'supervisor', 'auditor'].includes(rol) ||
        (rol === 'auditor' && !perfil.modulos_permitidos?.includes('allanamientos'))) {
      return errorJson(403, 'No tenés permiso para descargar este informe.');
    }
    if (rol === 'administrador') {
      const { data: assurance, error: mfaError } = await sesion.auth.mfa.getAuthenticatorAssuranceLevel();
      if (mfaError || assurance?.currentLevel !== 'aal2') {
        return errorJson(403, 'Verificá el segundo factor antes de descargar.');
      }
    }

    const { semana } = await context.params;
    const informe = /^2026-\d{2}-\d{2}$/.test(semana) ? informeHistoricoPorSemana(semana) : undefined;
    if (!informe) return errorJson(404, 'Informe no disponible.');

    const { data: pdf, error: archivoError } = await admin.storage.from(BUCKET).download(`${semana}.pdf`);
    if (archivoError || !pdf) return errorJson(404, 'El informe aún no está disponible para descargar.');
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const huella = createHash('sha256').update(bytes).digest('hex');
    if (huella !== informe.sha256 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
      console.error('El informe histórico no coincide con la copia inventariada.', { semana });
      return errorJson(503, 'El informe requiere verificación antes de su descarga.');
    }

    await registrarEventoAuditoria(admin, {
      actor: { id: user.id, email: perfil.email || user.email || null, rol },
      modulo: 'allanamientos', accion: 'descargar_informe_historico',
      entidadTipo: 'informe_semanal', entidadId: semana,
      motivo: 'Descarga del informe histórico presentado',
      referenciaDocumental: informe.archivo_pdf,
      detalles: { semana_inicio: semana, tipo: informe.tipo, archivo_sha256: huella },
    });

    return new Response(bytes, {
      status: 200,
      headers: {
        ...SIN_CACHE,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="COP_informe_${semana}.pdf"`,
      },
    });
  } catch (error) {
    console.error('No se pudo descargar el informe histórico.', error);
    return errorJson(503, 'No se pudo descargar el informe. Intentá nuevamente.');
  }
}
