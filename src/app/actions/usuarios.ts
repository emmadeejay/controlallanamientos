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

    const modulosRaw = formData.get('modulos_permitidos') as string;
    const modulos_permitidos = modulosRaw ? JSON.parse(modulosRaw) : ['allanamientos'];

    if (!email || !nombre_completo || !dni || !legajo || !superintendencia_id || !rol) {
      return { success: false, error: 'Todos los campos son obligatorios.' };
    }

    const { data: perfilCreador } = await supabaseAdmin
      .from('profiles')
      .select('rol')
      .eq('id', creadorId)
      .single();

    if (perfilCreador?.rol === 'supervisor' && rol === 'administrador') {
      return { success: false, error: 'No tienes permisos para crear un usuario con rol de Administrador.' };
    }

    const formattedEmail = email.trim().toLowerCase();
    const passwordTemporal = 'ABCdef123';

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: formattedEmail,
      password: passwordTemporal,
      email_confirm: true,
      user_metadata: { nombre_completo, dni, legajo },
    });

    if (authError) return { success: false, error: authError.message };

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: authData.user!.id,
      email: formattedEmail,
      dni,
      legajo,
      nombre_completo,
      rol,
      superintendencia_id,
      modulos_permitidos,
      activo: true,
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

export async function editarUsuarioAction(formData: FormData) {
  try {
    const id = formData.get('id') as string;
    const nombre_completo = formData.get('nombre_completo') as string;
    const dni = formData.get('dni') as string;
    const legajo = formData.get('legajo') as string;
    const superintendencia_id = formData.get('superintendencia_id') as string;
    const rol = formData.get('rol') as string;
    const modulosRaw = formData.get('modulos_permitidos') as string;
    const modulos_permitidos = modulosRaw ? JSON.parse(modulosRaw) : [];

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        nombre_completo,
        dni,
        legajo,
        superintendencia_id,
        rol,
        modulos_permitidos
      })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al editar usuario.' };
  }
}

export async function toggleEstadoUsuarioAction(userId: string, estadoActual: boolean) {
  try {
    const nuevoEstado = !estadoActual;
    
    // 1. Actualizamos perfil
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ activo: nuevoEstado })
      .eq('id', userId);

    if (profileError) throw profileError;

    // 2. Si se pausa, podemos banearlo en Auth de Supabase para cortar la sesión al instante
    await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { ban_duration: nuevoEstado ? 'none' : '876600h' } // 100 años si se pausa
    );

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al cambiar estado.' };
  }
}

export async function eliminarUsuarioAction(userId: string) {
  try {
    // 1. Eliminar de Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) throw authError;

    // 2. Eliminar de la tabla profiles
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al eliminar usuario.' };
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

export async function cambiarPasswordObligatorioAction(userId: string, nuevaPassword: string) {
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: nuevaPassword }
    );

    if (error) throw error;

    await supabaseAdmin
      .from('profiles')
      .update({ requiere_cambio_clave: false })
      .eq('id', userId);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al cambiar la contraseña.' };
  }
}