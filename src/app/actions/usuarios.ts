'use server';

import { createClient } from '@supabase/supabase-js';

// Helper para instanciar el cliente Admin únicamente cuando se ejecuta la función
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Faltan configurar las variables de entorno SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL en Vercel/Servidor.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function crearUsuarioAction(formData: FormData, creadorId?: string) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

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

    // Verificar rol del creador si viene creadorId
    if (creadorId) {
      const { data: perfilCreador } = await supabaseAdmin
        .from('profiles')
        .select('rol')
        .eq('id', creadorId)
        .maybeSingle();

      if (perfilCreador?.rol === 'supervisor' && rol === 'administrador') {
        return { success: false, error: 'No tienes permisos para crear un usuario con rol de Administrador.' };
      }
    }

    const passwordTemporal = 'ABCdef123';

    // 1. Crear en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passwordTemporal,
      email_confirm: true,
      user_metadata: { nombre, apellido, nombre_completo, dni, legajo },
    });

    if (authError) return { success: false, error: authError.message };

    // 2. Insertar en tabla profiles
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
      // Limpieza en caso de error
      await supabaseAdmin.auth.admin.deleteUser(authData.user!.id);
      return { success: false, error: `Error en perfil: ${profileError.message}` };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error en crearUsuarioAction:', err);
    return { success: false, error: err?.message || 'Error inesperado al crear usuario.' };
  }
}

export async function editarUsuarioAction(formData: FormData) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

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
    const supabaseAdmin = getSupabaseAdmin();
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
    const supabaseAdmin = getSupabaseAdmin();

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
    const supabaseAdmin = getSupabaseAdmin();
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
    const supabaseAdmin = getSupabaseAdmin();

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