'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function crearUsuarioAction(formData: FormData, creadorId: string) {
  try {
    const nombre = (formData.get('nombre') as string || '').trim();
    const apellido = (formData.get('apellido') as string || '').trim();
    const dni = (formData.get('dni') as string || '').trim();
    const legajo = (formData.get('legajo') as string || '').trim();
    const email = (formData.get('email') as string || '').trim().toLowerCase();
    const superintendencia_id = formData.get('superintendencia_id') as string;
    const rol = formData.get('rol') as string;

    const modulosRaw = formData.get('modulos_array') as string;
    const modulos_permitidos: string[] = modulosRaw ? JSON.parse(modulosRaw) : ['allanamientos'];

    const nombre_completo = `${nombre} ${apellido}`.trim();

    if (!email || !nombre || !apellido || !dni || !legajo || !superintendencia_id || !rol) {
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

    const passwordTemporal = 'ABCdef123';

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passwordTemporal,
      email_confirm: true,
      user_metadata: { nombre, apellido, nombre_completo, dni, legajo },
    });

    if (authError) return { success: false, error: authError.message };

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: authData.user!.id,
      email,
      nombre,
      apellido,
      nombre_completo,
      dni,
      legajo,
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
    return { success: false, error: err?.message || 'Error inesperado al crear usuario.' };
  }
}

export async function editarUsuarioAction(formData: FormData) {
  try {
    const id = formData.get('id') as string;
    const nombre = (formData.get('nombre') as string || '').trim();
    const apellido = (formData.get('apellido') as string || '').trim();
    const dni = (formData.get('dni') as string || '').trim();
    const legajo = (formData.get('legajo') as string || '').trim();
    const superintendencia_id = formData.get('superintendencia_id') as string;
    const rol = formData.get('rol') as string;

    const modulosRaw = formData.get('modulos_array') as string;
    const modulos_permitidos: string[] = modulosRaw ? JSON.parse(modulosRaw) : [];

    const nombre_completo = `${nombre} ${apellido}`.trim();

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        nombre,
        apellido,
        nombre_completo,
        dni,
        legajo,
        superintendencia_id,
        rol,
        modulos_permitidos
      })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al editar usuario.' };
  }
}

export async function toggleEstadoUsuarioAction(userId: string, estadoActual: boolean) {
  try {
    const nuevoEstado = !estadoActual;
    
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ activo: nuevoEstado })
      .eq('id', userId);

    if (profileError) return { success: false, error: profileError.message };

    await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { ban_duration: nuevoEstado ? 'none' : '876600h' }
    );

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al cambiar estado.' };
  }
}

export async function eliminarUsuarioAction(userId: string) {
  try {
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) return { success: false, error: authError.message };

    const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
    if (profileError) return { success: false, error: profileError.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al eliminar usuario.' };
  }
}

export async function resetearPasswordAction(userId: string, nuevaPassword: string) {
  try {
    if (!userId) return { success: false, error: 'ID de usuario no proporcionado.' };

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: nuevaPassword }
    );

    if (authError) return { success: false, error: authError.message };

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ requiere_cambio_clave: true })
      .eq('id', userId);

    if (profileError) return { success: false, error: profileError.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error interno al actualizar contraseña.' };
  }
}

export async function cambiarPasswordObligatorioAction(userId: string, nuevaPassword: string) {
  try {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: nuevaPassword }
    );

    if (authError) return { success: false, error: authError.message };

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ requiere_cambio_clave: false })
      .eq('id', userId);

    if (profileError) return { success: false, error: profileError.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al cambiar la contraseña.' };
  }
}