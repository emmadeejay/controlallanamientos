import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { perfilTieneAcceso } from '@/lib/usuarios';
import MfaPanel from './MfaPanel';

export default async function MfaPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('rol, activo, estado_cuenta, vigencia_institucional_hasta, requiere_cambio_clave')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || !perfilTieneAcceso(profile) || profile.requiere_cambio_clave) {
    redirect('/select-app');
  }
  if (!['administrador', 'admin'].includes(String(profile.rol).trim().toLowerCase())) {
    redirect('/select-app');
  }

  return <MfaPanel email={user.email ?? ''} />;
}
