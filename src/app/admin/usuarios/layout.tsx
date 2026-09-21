import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type UsuariosLayoutProps = {
  children: ReactNode;
};

const ROLES_AUTORIZADOS = new Set(['administrador', 'supervisor']);

function normalizarRol(valor: unknown): string {
  const rol = String(valor ?? '').trim().toLowerCase();

  // Compatibilidad temporal con registros antiguos.
  return rol === 'admin' ? 'administrador' : rol;
}

export default async function UsuariosLayout({
  children,
}: UsuariosLayoutProps) {
  const supabaseSesion = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabaseSesion.auth.getUser();

  if (userError || !user) {
    redirect('/login');
  }

  // Esta consulta se ejecuta exclusivamente en el servidor.
  // La clave service_role nunca se envía al navegador.
  const supabaseAdmin = createAdminClient();

  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from('profiles')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle();

  const rol = normalizarRol(perfil?.rol);
  const cuentaActiva = perfil?.activo !== false;

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