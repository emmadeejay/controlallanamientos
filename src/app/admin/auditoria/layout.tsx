import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { perfilTieneAcceso } from '@/lib/usuarios';

export const dynamic = 'force-dynamic';

export default async function AuditoriaLayout({ children }: { children: ReactNode }) {
  const supabaseSesion = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabaseSesion.auth.getUser();

  if (userError || !user) {
    redirect('/login');
  }

  const supabaseAdmin = createAdminClient();
  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from('profiles')
    .select('rol, activo, estado_cuenta, vigencia_institucional_hasta')
    .eq('id', user.id)
    .maybeSingle();

  const rol = String(perfil?.rol ?? '').trim().toLowerCase();
  const esAdministrador = rol === 'administrador' || rol === 'admin';

  if (
    perfilError ||
    !perfil ||
    !perfilTieneAcceso(perfil) ||
    !esAdministrador
  ) {
    redirect('/select-app');
  }

  return children;
}
