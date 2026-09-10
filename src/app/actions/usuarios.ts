'use server';

import { createClient } from '@supabase/supabase-js';

// Usamos la Service Role Key para operaciones administrativas
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function crearUsuarioAction(formData: FormData, creadorId: string) {
  try {
    const nombre_completo = formData.get('nombre_completo') as string;
    const dni = formData.get('dni') as string;
    const legajo = formData.get('legajo') as string;
    let email = formData.get('email') as string;
    const superintendencia_id = formData.get('superintendencia_id') as string;
    const rol = formData.get('rol') as string;

    if (!email || !nombre_completo || !dni || !legajo || !superintendencia_id || !rol) {
      return { success: false, error: 'Todos los campos son obligatorios.' };
    }

    // 1. Validar rol del creador para evitar que un supervisor cree un administrador
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

    const cleanEmail = email.trim().toLowerCase();
    const formattedEmail = cleanEmail.includes('@') ? cleanEmail : `${cleanEmail}@cop.estadistica.ar`;

    // 2. Contraseña por defecto obligatoria para todos los nuevos usuarios
    const passwordTemporal = 'ABCdef123';

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: formattedEmail,
      password: passwordTemporal,
      email_confirm: true,
      user_metadata: { nombre_completo, dni, legajo },
    });

    if (authError) return { success: false, error: authError.message };

    // 3. Guardar en la tabla profiles con DNI y Legajo separados y requiere_cambio_clave en true
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
      // Rollback de Auth si falla el perfil
      await supabaseAdmin.auth.admin.deleteUser(authData.user!.id);
      return { success: false, error: `Error en perfil: ${profileError.message}` };
    }

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