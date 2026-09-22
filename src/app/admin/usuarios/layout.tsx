import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { perfilTieneAcceso } from '@/lib/usuarios';

type UsuariosLayoutProps = {
  children: ReactNode;
};

const ROLES_AUTORIZADOS = new Set(['administrador', 'supervisor']);

function normalizarRol(valor: unknown): string {
  const rol = String(valor ?? '').trim().toLowerCase();

  // Compatibilidad temporal con registros antiguos.
  return rol === 'admin' ? 'administrador' : rol;
}

export default async function UsuariosLayout({ children }: UsuariosLayoutProps) {
  const supabaseSesion = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabaseSesion.auth.getUser();

  if (userError || !user) {
    redirect('/login');
  }

  // La consulta privilegiada ocurre únicamente en el servidor. La clave
  // service_role nunca se envía al navegador.
  const supabaseAdmin = createAdminClient();
  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from('profiles')
    .select('rol, activo, estado_cuenta, vigencia_institucional_hasta')
    .eq('id', user.id)
    .maybeSingle();

  const rol = normalizarRol(perfil?.rol);
  const cuentaActiva = perfil ? perfilTieneAcceso(perfil) : false;

  if (
    perfilError ||
    !perfil ||
    !cuentaActiva ||
    !ROLES_AUTORIZADOS.has(rol)
  ) {
    redirect('/select-app');
  }

  return children;
}
