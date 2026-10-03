'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { INFORMES_HISTORICOS } from '@/lib/informes-historicos';
import { normalizarRolUsuario, perfilTieneAcceso } from '@/lib/usuarios';

export type ResumenHistoricoConsulta = {
  id: string;
  semana_inicio: string;
  semana_fin: string;
  total_presentado: number;
  archivo_excel: string;
  archivo_pdf: string;
  unidades: Array<{ nombre_fuente: string; total_informado: number | null }>;
  tipo: 'documental' | 'individual' | 'parcial';
  filas_importadas: number | null;
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
      .select('rol, activo, estado_cuenta, vigencia_institucional_hasta, modulos_permitidos')
      .eq('id', user.id)
      .maybeSingle();
    const rol = normalizarRolUsuario(perfil?.rol);
    const esGestion = rol === 'administrador' || rol === 'supervisor';
    if (perfilError || !perfil || !perfilTieneAcceso(perfil) || !ROLES_CONSULTA.has(rol) ||
        (!esGestion && !perfil.modulos_permitidos?.includes('allanamientos'))) {
      return { success: false, error: 'No tenés permiso para consultar los resúmenes.' };
    }

    // Los resúmenes representan semanas completas. Un período parcial puede
    // solaparse con una semana, pero el total nunca se prorratea por día.
    const especiales = INFORMES_HISTORICOS.filter((informe) => informe.tipo !== 'documental' &&
      informe.semana_inicio <= hasta && informe.semana_fin >= desde);
    const consultaLotes = especiales.length > 0
      ? admin.from('importaciones_allanamientos')
          .select('semana_inicio, filas_importadas, archivo_nombre')
          .eq('estado', 'completado')
          .in('semana_inicio', especiales.map((informe) => informe.semana_inicio))
      : Promise.resolve({ data: [], error: null });
    const [{ data, error }, { data: lotes, error: lotesError }] = await Promise.all([
      admin.from('resumenes_historicos_semanales')
      .select('id, semana_inicio, semana_fin, total_presentado, archivo_excel, archivo_pdf, resumenes_historicos_unidades(nombre_fuente, total_informado)')
      .eq('estado', 'vigente')
      .lte('semana_inicio', hasta)
      .gte('semana_fin', desde)
      .order('semana_inicio', { ascending: false })
      .limit(500),
      consultaLotes,
    ]);
    if (error || lotesError) throw error ?? lotesError;
    const semanasConDetalle = new Set(especiales.map((informe) => informe.semana_inicio));
    const documentales: ResumenHistoricoConsulta[] = (data ?? [])
      .filter((item) => !semanasConDetalle.has(item.semana_inicio))
      .map((item) => ({
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
      tipo: 'documental',
      filas_importadas: null,
      }));
    const individuales: ResumenHistoricoConsulta[] = especiales.map((informe) => {
      const archivos = (lotes ?? []).filter((lote) => lote.semana_inicio === informe.semana_inicio);
      return {
        id: `informe-${informe.semana_inicio}`,
        semana_inicio: informe.semana_inicio,
        semana_fin: informe.semana_fin,
        total_presentado: informe.total_informe,
        archivo_excel: archivos.map((lote) => lote.archivo_nombre).join(', '),
        archivo_pdf: informe.archivo_pdf,
        unidades: [],
        tipo: informe.tipo,
        filas_importadas: archivos.reduce((total, lote) => total + Number(lote.filas_importadas || 0), 0),
      };
    });
    const resumenes = [...documentales, ...individuales]
      .sort((a, b) => b.semana_inicio.localeCompare(a.semana_inicio));
    return { success: true, resumenes };
  } catch (error) {
    console.error('No se pudieron consultar los resúmenes históricos.', error);
    return { success: false, error: 'No se pudieron consultar los totales documentales.' };
  }
}
