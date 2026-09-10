'use server';

import { createClient } from '@supabase/supabase-js';

// Usamos la Service Role Key para operaciones administrativas
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function crearUsuarioAction(formData: FormData, creadorId: string) {
  // ... (Tu código actual de crearUsuarioAction sigue igual)
  try {
    const nombre_completo = formData.get('nombre_completo') as string;
    const legajo_o_dni = formData.get('legajo_o_dni') as string;
    let email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const superintendencia_id = formData.get('superintendencia_id') as string;
    const rol = formData.get('rol') as string;

    if (!email || !password || !nombre_completo || !superintendencia_id || !rol) {
      return { success: false, error: 'Todos los campos son obligatorios.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const formattedEmail = cleanEmail.includes('@') ? cleanEmail : `${cleanEmail}@cop.estadistica.ar`;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: formattedEmail,
      password: password,
      email_confirm: true,
      user_metadata: { nombre_completo, legajo_o_dni },
    });

    if (authError) return { success: false, error: authError.message };

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: authData.user!.id,
      email: formattedEmail,
      username: legajo_o_dni,
      nombre_completo,
      rol,
      superintendencia_id,
      requiere_cambio_clave: true,
    });

    if (profileError) return { success: false, error: `Error en perfil: ${profileError.message}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// NUEVA FUNCIÓN PARA RESETEAR CLAVE
export async function resetearPasswordAction(userId: string, nuevaPassword: string) {
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: nuevaPassword }
    );

    if (error) throw error;

    await supabaseAdmin
      .from('profiles')
      .update({ requiere_cambio_clave: true })
      .eq('id', userId);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al actualizar contraseña' };
  }
}