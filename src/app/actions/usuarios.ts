'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function crearUsuarioAction(formData: FormData, creadorId: string) {
  try {
    const nombre_completo = formData.get('nombre_completo') as string;
    const dni = formData.get('dni') as string;
    const legajo = formData.get('legajo') as string;
    const email = formData.get('email') as string;
    const superintendencia_id = formData.get('superintendencia_id') as string;
    const rol = formData.get('rol') as string;

    if (!email || !nombre_completo || !dni || !legajo || !superintendencia_id || !rol) {
      return { success: false, error: 'Todos los campos son obligatorios.' };
    }

    // 1. Validar rol del creador para evitar escalada de privilegios
    const { data: perfilCreador, error: errorPerfilCreador } = await supabaseAdmin
      .from('profiles')
      .select('rol')
      .eq('id', creadorId)
      .single();

    if (errorPerfilCreador || !perfilCreador) {
      return { success: false, error: 'No se pudo verificar el rol del usuario actual.' };
    }

    if (perfilCreador.rol === 'supervisor' && rol === 'administrador') {
      return { success: false, error: 'No tienes permisos para crear un usuario con rol de Administrador.' };
    }

    // Usamos el email tal cual lo ingresa el usuario, sin concatenar dominios forzados si ya trae uno
    const formattedEmail = email.trim().toLowerCase();

    // 2. Contraseña por defecto obligatoria
    const passwordTemporal = 'ABCdef123';

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: formattedEmail,
      password: passwordTemporal,
      email_confirm: true,
      user_metadata: { nombre_completo, dni, legajo },
    });

    if (authError) return { success: false, error: authError.message };

    // 3. Guardar en la tabla profiles
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: authData.user!.id,
      email: formattedEmail,
      dni,
      legajo,
      nombre_completo,
      rol,
      superintendencia_id,
      requiere_cambio_clave: true,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user!.id);
      return { success: false, error: `Error en perfil: ${profileError.message}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

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