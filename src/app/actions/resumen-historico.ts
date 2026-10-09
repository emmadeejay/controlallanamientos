'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { normalizarRolUsuario, perfilTieneAcceso } from '@/lib/usuarios';

export type ResumenHistoricoConsulta = {
  id: string;
  semana_inicio: string;
  semana_fin: string;
  total_presentado: number;
  archivo_excel: string;
  archivo_pdf: string;
  unidades: Array<{ nombre_fuente: string; total_informado: number | null }>;
};

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const ROLES_CONSULTA = new Set(['administrador', 'supervisor', 'auditor', 'consulta']);

export async function consultarResumenesHistoricosAction(desde: string, hasta: string): Promise<
  { success: true; resumenes: ResumenHistoricoConsulta[] } |
  { success: false; error: string }
> {
  if (!FECHA_ISO.test(desde) || !FECHA_ISO.test(hasta) || desde > hasta ||
      !Number.isFinite(Date.parse(`${desde}T00:00:00Z`)) ||
      !Number.isFinite(Date.parse(`${hasta}T00:00:00Z`))) {
    return { success: false, error: 'El período de consulta no es válido.' };
  }

  try {
    const sesion = await createClient();
    const { data: { user }, error: sesionError } = await sesion.auth.getUser();
    if (sesionError || !user) return { success: false, error: 'La sesión no es válida.' };

    const admin = createAdminClient();
    const { data: perfil, error: perfilError } = await admin
      .from('profiles')
      .select('rol, activo, estado_cuenta, vigencia_institucional_hasta, requiere_cambio_clave, modulos_permitidos')
      .eq('id', user.id)
      .maybeSingle();
    const rol = normalizarRolUsuario(perfil?.rol);
    const esGestion = rol === 'administrador' || rol === 'supervisor';
    if (perfilError || !perfil || !perfilTieneAcceso(perfil) || perfil.requiere_cambio_clave !== false || !ROLES_CONSULTA.has(rol) ||
        (!esGestion && !perfil.modulos_permitidos?.includes('allanamientos'))) {
      return { success: false, error: 'No tenés permiso para consultar los resúmenes.' };
    }

    if (rol === 'consulta') {
      // Consulta recibe estadísticas: no IDs documentales ni nombres de archivos.
      const [resumenes, padron] = await Promise.all([
        admin.from('resumenes_historicos_semanales')
          .select('semana_inicio, semana_fin, total_presentado, resumenes_historicos_unidades(nombre_fuente, total_informado)')
          .eq('estado', 'vigente')
          .lte('semana_inicio', hasta)
          .gte('semana_fin', desde)
          .order('semana_inicio', { ascending: false })
          .limit(500),
        admin.from('superintendencias').select('nombre'),
      ]);
      if (resumenes.error) throw resumenes.error;
      if (padron.error) throw padron.error;
      const nombres = new Map((padron.data ?? []).map((s) => [s.nombre.trim().toUpperCase(), s.nombre]));
      return {
        success: true,
        resumenes: (resumenes.data ?? []).map((item) => {
          const unidades = new Map<string, number | null>();
          for (const unidad of item.resumenes_historicos_unidades ?? []) {
            const nombre = nombres.get(unidad.nombre_fuente.trim().toUpperCase()) ?? 'Sin especificar';
            const anterior = unidades.get(nombre) ?? null;
            unidades.set(nombre, anterior === null && unidad.total_informado === null
              ? null : (anterior ?? 0) + (unidad.total_informado ?? 0));
          }
          return {
            id: item.semana_inicio,
            semana_inicio: item.semana_inicio,
            semana_fin: item.semana_fin,
            total_presentado: item.total_presentado,
            archivo_excel: '',
            archivo_pdf: '',
            unidades: Array.from(unidades, ([nombre_fuente, total_informado]) => ({ nombre_fuente, total_informado })),
          };
        }),
      };
    }

    // Los resúmenes representan semanas completas. Un período parcial puede
    // solaparse con una semana, pero el total nunca se prorratea por día.
    const { data, error } = await admin.from('resumenes_historicos_semanales')
      .select('id, semana_inicio, semana_fin, total_presentado, archivo_excel, archivo_pdf, resumenes_historicos_unidades(nombre_fuente, total_informado)')
      .eq('estado', 'vigente')
      .lte('semana_inicio', hasta)
      .gte('semana_fin', desde)
      .order('semana_inicio', { ascending: false })
      .limit(500);
    if (error) throw error;
    const resumenes: ResumenHistoricoConsulta[] = (data ?? []).map((item) => ({
      id: item.id,
      semana_inicio: item.semana_inicio,
      semana_fin: item.semana_fin,
      total_presentado: item.total_presentado,
      archivo_excel: item.archivo_excel,
      archivo_pdf: item.archivo_pdf,
      unidades: (item.resumenes_historicos_unidades ?? []).map((unidad) => ({
        nombre_fuente: unidad.nombre_fuente,
        total_informado: unidad.total_informado,
      })),
    }));
    return { success: true, resumenes };
  } catch (error) {
    console.error('No se pudieron consultar los resúmenes históricos.', error);
    return { success: false, error: 'No se pudieron consultar los totales documentales.' };
  }
}
