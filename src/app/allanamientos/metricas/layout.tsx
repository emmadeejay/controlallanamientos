import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { perfilTieneAcceso } from '@/lib/usuarios';

const ROLES_METRICAS = new Set([
  'administrador',
  'supervisor',
  'auditor',
  'consulta',
]);

export default async function MetricasLayout({ children }: { children: ReactNode }) {
  const supabaseSesion = await createClient();
  const {
    data: { user },
  } = await supabaseSesion.auth.getUser();

  if (!user) redirect('/login');

  const supabaseAdmin = createAdminClient();
  const { data: perfil } = await supabaseAdmin
    .from('profiles')
    .select('rol, activo, estado_cuenta, vigencia_institucional_hasta, modulos_permitidos')
    .eq('id', user.id)
    .maybeSingle();

  const rolOriginal = String(perfil?.rol ?? '').trim().toLowerCase();
  const rol = rolOriginal === 'admin' ? 'administrador' : rolOriginal;
  const esGestion = rol === 'administrador' || rol === 'supervisor';
  const esConsultaEjecutiva = rol === 'auditor' || rol === 'consulta';
  const tieneModulo =
    esGestion ||
    esConsultaEjecutiva ||
    perfil?.modulos_permitidos?.includes('allanamientos');

  if (!perfil || !perfilTieneAcceso(perfil) || !ROLES_METRICAS.has(rol) || !tieneModulo) {
    redirect('/select-app');
  }

  return children;
}
