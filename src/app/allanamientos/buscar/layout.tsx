import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const ROLES_CONSULTA = new Set([
  'administrador',
  'supervisor',
  'auditor',
  'consulta',
]);

export default async function BuscarLayout({ children }: { children: ReactNode }) {
  const supabaseSesion = await createClient();
  const {
    data: { user },
  } = await supabaseSesion.auth.getUser();

  if (!user) redirect('/login');

  const supabaseAdmin = createAdminClient();
  const { data: perfil } = await supabaseAdmin
    .from('profiles')
    .select('rol, activo, modulos_permitidos')
    .eq('id', user.id)
    .maybeSingle();

  const rolOriginal = String(perfil?.rol ?? '').trim().toLowerCase();
  const rol = rolOriginal === 'admin' ? 'administrador' : rolOriginal;
  const esGestion = rol === 'administrador' || rol === 'supervisor';
  const tieneModulo = esGestion || perfil?.modulos_permitidos?.includes('allanamientos');

  if (perfil?.activo === false || !ROLES_CONSULTA.has(rol) || !tieneModulo) {
    redirect('/allanamientos');
  }

  return children;
}
