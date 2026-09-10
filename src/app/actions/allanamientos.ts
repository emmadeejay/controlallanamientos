'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function crearAllanamientoAction(formData: FormData, userId: string) {
  try {
    // 1. Validar el rol del usuario que intenta cargar
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('rol, superintendencia_id')
      .eq('id', userId)
      .single();

    if (!profile) {
      return { success: false, error: 'No se encontró el perfil del usuario.' };
    }

    const rol = profile.rol?.trim().toLowerCase();
    const rolesPermitidos = ['administrador', 'supervisor', 'operador'];

    if (!rolesPermitidos.includes(rol)) {
      return { success: false, error: 'No tienes permisos para registrar allanamientos.' };
    }

    // 2. Extraer los campos del formulario según tu esquema
    const numero_ipp = formData.get('numero_ipp') as string;
    const caratula = formData.get('caratula') as string;
    const ufi_juzgado = formData.get('ufi_juzgado') as string;
    const fecha_solicitud = formData.get('fecha_solicitud') as string || null;
    const lugar_presentacion = formData.get('lugar_presentacion') as string;
    const partido = formData.get('partido') as string;
    const fecha_ejecucion = formData.get('fecha_ejecucion') as string;
    const horario_ejecucion = formData.get('horario_ejecucion') as string;
    const departamental = formData.get('departamental') as string;
    const dependencia = formData.get('dependencia') as string;
    
    const objetivos = Number(formData.get('objetivos')) || 1;
    const personal_propio = Number(formData.get('personal_propio')) || 0;
    const especialidad_colaboracion = formData.get('especialidad_colaboracion') as string;
    const personal_solicitado = Number(formData.get('personal_solicitado')) || 0;
    const personal_afectado = Number(formData.get('personal_afectado')) || 0;
    
    const resultado_medida = formData.get('resultado_medida') as string;
    const es_positivo = resultado_medida === 'Positivo';
    const resultado_secuestros = formData.get('resultado_secuestros') as string;
    
    const numero_parte_urgente = formData.get('numero_parte_urgente') as string;
    const observaciones = formData.get('observaciones') as string;
    const orden_servicio_propia = formData.get('orden_servicio_propia') as string;
    const orden_servicio_cop = formData.get('orden_servicio_cop') as string;

    // 3. Insertar en la tabla allanamientos
    const { error: insertError } = await supabaseAdmin.from('allanamientos').insert({
      numero_ipp,
      caratula,
      ufi_juzgado,
      fecha_solicitud,
      lugar_presentacion,
      partido,
      fecha_ejecucion,
      horario_ejecucion,
      departamental,
      dependencia,
      objetivos,
      personal_propio,
      especialidad_colaboracion,
      personal_solicitado,
      personal_afectado,
      resultado_medida,
      es_positivo,
      resultado_secuestros,
      numero_parte_urgente,
      observaciones,
      operador_id: userId,
      orden_servicio_propia,
      orden_servicio_cop
    });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado al registrar el allanamiento.' };
  }
}