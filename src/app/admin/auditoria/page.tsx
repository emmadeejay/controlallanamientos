'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Filter,
  RefreshCw,
  Search,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import CopAdminHeader from '@/components/CopAdminHeader';

type EventoAuditoria = {
  id: number;
  created_at: string;
  actor_email: string | null;
  actor_rol: string | null;
  modulo: string;
  accion: string;
  entidad_tipo: string;
  entidad_id: string | null;
  superintendencia_nombre: string | null;
  resultado: string;
  motivo: string | null;
  referencia_documental: string | null;
  detalles: Record<string, unknown> | null;
};

const POR_PAGINA = 25;

type FiltrosAuditoria = {
  busqueda: string;
  modulo: string;
  desde: string;
  hasta: string;
};

const ETIQUETAS_ACCION: Record<string, string> = {
  crear_allanamiento: 'Alta de allanamiento',
  editar_allanamiento: 'Edición de allanamiento',
  eliminar_allanamiento: 'Eliminación de allanamiento',
  finalizar_rendicion_operador: 'Rendición finalizada por operador',
  finalizar_rendicion_gestion: 'Rendición finalizada por gestión',
  reabrir_rendicion: 'Rendición reabierta',
  consolidar_informe_semanal: 'Informe semanal consolidado',
  descargar_informe_semanal_pdf: 'PDF semanal descargado',
  exportar_allanamientos_excel: 'Excel de allanamientos exportado',
  crear_usuario: 'Alta de usuario',
  editar_usuario: 'Edición de usuario',
  activar_usuario: 'Usuario activado',
  reactivar_usuario: 'Identidad reactivada',
  pausar_usuario: 'Usuario pausado',
  deshabilitar_usuario: 'Baja operativa de usuario',
  revalidar_usuario: 'Revalidación institucional',
  trasladar_usuario: 'Traslado de usuario',
  eliminar_usuario: 'Usuario eliminado',
  restablecer_password: 'Contraseña restablecida',
  iniciar_reset_clave_usuario: 'Restablecimiento de clave iniciado',
  cambiar_password_obligatorio: 'Cambio obligatorio de contraseña',
  cambiar_password_sesion: 'Cambio de contraseña con sesión autenticada',
};

function fechaArgentina(fechaIso: string) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(fechaIso));
}

function limpiarBusqueda(valor: string) {
  return valor.trim().replace(/[%(),]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
}

function resumenDetalles(detalles: Record<string, unknown> | null) {
  if (!detalles) return '—';
  const ipp = typeof detalles.numero_ipp === 'string' ? `IPP ${detalles.numero_ipp}` : '';
  const cantidad = typeof detalles.cantidad_allanamientos === 'number'
    ? `${detalles.cantidad_allanamientos} registros`
    : '';
  const email = typeof detalles.email === 'string' ? detalles.email : '';
  const campos = Array.isArray(detalles.campos_modificados)
    ? `Campos: ${detalles.campos_modificados.join(', ')}`
    : '';
  const vigencia = typeof detalles.vigencia_hasta === 'string'
    ? `Vigencia ${detalles.vigencia_hasta}`
    : '';
  const estado = typeof detalles.estado_nuevo === 'string'
    ? `Estado ${detalles.estado_nuevo}`
    : '';
  return [ipp, cantidad, email, campos, vigencia, estado].filter(Boolean).join(' · ') || '—';
}

export default function AuditoriaPage() {
  const [miEmail, setMiEmail] = useState('');
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [mensajeExportacion, setMensajeExportacion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [modulo, setModulo] = useState('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosAuditoria>({
    busqueda: '',
    modulo: 'todos',
    desde: '',
    hasta: '',
  });

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const rangoVisible = useMemo(() => {
    if (total === 0) return '0 registros';
    const inicio = (pagina - 1) * POR_PAGINA + 1;
    const fin = Math.min(pagina * POR_PAGINA, total);
    return `${inicio}–${fin} de ${total}`;
  }, [pagina, total]);

  async function cargarEventos(
    paginaDestino = pagina,
    filtros: FiltrosAuditoria = filtrosAplicados,
  ) {
    setCargando(true);
    setError(null);

    let query = supabase
      .from('auditoria_eventos')
      .select(
        'id, created_at, actor_email, actor_rol, modulo, accion, entidad_tipo, entidad_id, superintendencia_nombre, resultado, motivo, referencia_documental, detalles',
        { count: 'exact' },
      );

    if (filtros.modulo !== 'todos') query = query.eq('modulo', filtros.modulo);
    if (filtros.desde) query = query.gte('created_at', `${filtros.desde}T00:00:00-03:00`);
    if (filtros.hasta) query = query.lte('created_at', `${filtros.hasta}T23:59:59.999-03:00`);

    const termino = limpiarBusqueda(filtros.busqueda);
    if (termino) {
      query = query.or(
        `actor_email.ilike.%${termino}%,accion.ilike.%${termino}%,entidad_id.ilike.%${termino}%,superintendencia_nombre.ilike.%${termino}%`,
      );
    }

    const desdeFila = (paginaDestino - 1) * POR_PAGINA;
    const { data, count, error: queryError } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(desdeFila, desdeFila + POR_PAGINA - 1);

    if (queryError) {
      setError(queryError.message || 'No se pudo consultar la auditoría.');
      setEventos([]);
      setTotal(0);
    } else {
      setEventos((data ?? []) as EventoAuditoria[]);
      setTotal(count ?? 0);
      setPagina(paginaDestino);
    }

    setCargando(false);
  }

  useEffect(() => {
    cargarEventos(1);
    void supabase.auth.getUser().then(({ data: { user } }) => setMiEmail(user?.email || ''));
    // Los filtros se aplican únicamente con el botón para evitar consultas por tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aplicarFiltros() {
    const nuevosFiltros = { busqueda, modulo, desde, hasta };
    setFiltrosAplicados(nuevosFiltros);
    setPagina(1);
    cargarEventos(1, nuevosFiltros);
  }

  function limpiarFiltros() {
    setBusqueda('');
    setModulo('todos');
    setDesde('');
    setHasta('');
    setPagina(1);
    const filtrosVacios = { busqueda: '', modulo: 'todos', desde: '', hasta: '' };
    setFiltrosAplicados(filtrosVacios);
    cargarEventos(1, filtrosVacios);
  }

  async function cerrarSesion() {
    if (cerrandoSesion) return;
    setCerrandoSesion(true);
    setError(null);
    const { error: cierreError } = await supabase.auth.signOut();
    if (cierreError) {
      setError('No se pudo cerrar sesión. Intentá nuevamente.');
      setCerrandoSesion(false);
      return;
    }
    window.location.replace('/login');
  }

  async function exportarAuditoria() {
    if (exportando) return;
    setExportando(true);
    setError(null);
    setMensajeExportacion(null);

    const acumulados: EventoAuditoria[] = [];
    const lote = 1000;
    const limiteSeguro = 20000;
    let ultimoId: number | null = null;

    // Verificar el tamaño antes de generar el archivo. Nunca entregar un Excel
    // que parezca completo si el filtro excede el límite del navegador.
    let conteoQuery = supabase
      .from('auditoria_eventos')
      .select('id', { count: 'exact' });
    if (filtrosAplicados.modulo !== 'todos') conteoQuery = conteoQuery.eq('modulo', filtrosAplicados.modulo);
    if (filtrosAplicados.desde) conteoQuery = conteoQuery.gte('created_at', `${filtrosAplicados.desde}T00:00:00-03:00`);
    if (filtrosAplicados.hasta) conteoQuery = conteoQuery.lte('created_at', `${filtrosAplicados.hasta}T23:59:59.999-03:00`);
    const termino = limpiarBusqueda(filtrosAplicados.busqueda);
    if (termino) {
      conteoQuery = conteoQuery.or(
        `actor_email.ilike.%${termino}%,accion.ilike.%${termino}%,entidad_id.ilike.%${termino}%,superintendencia_nombre.ilike.%${termino}%`,
      );
    }
    const { data: primerEvento, count: totalExportacion, error: conteoError } = await conteoQuery
      .order('id', { ascending: false })
      .limit(1);
    if (conteoError || totalExportacion === null) {
      setError(conteoError?.message || 'No se pudo verificar la cantidad de eventos a exportar.');
      setExportando(false);
      return;
    }
    if (totalExportacion > limiteSeguro) {
      setError(`Hay ${totalExportacion} eventos para este filtro. El máximo por archivo es ${limiteSeguro}; aplicá un rango de fechas más corto y exportá cada tramo por separado.`);
      setExportando(false);
      return;
    }
    if (totalExportacion === 0) {
      setError('No hay eventos para exportar con los filtros aplicados.');
      setExportando(false);
      return;
    }
    const idMaximo = primerEvento?.[0]?.id;

    while (acumulados.length < totalExportacion) {
      let query = supabase
        .from('auditoria_eventos')
        .select('id, created_at, actor_email, actor_rol, modulo, accion, entidad_tipo, entidad_id, superintendencia_nombre, resultado, motivo, referencia_documental, detalles');

      if (filtrosAplicados.modulo !== 'todos') query = query.eq('modulo', filtrosAplicados.modulo);
      if (filtrosAplicados.desde) query = query.gte('created_at', `${filtrosAplicados.desde}T00:00:00-03:00`);
      if (filtrosAplicados.hasta) query = query.lte('created_at', `${filtrosAplicados.hasta}T23:59:59.999-03:00`);

      if (termino) {
        query = query.or(
          `actor_email.ilike.%${termino}%,accion.ilike.%${termino}%,entidad_id.ilike.%${termino}%,superintendencia_nombre.ilike.%${termino}%`,
        );
      }

      if (idMaximo !== undefined) query = query.lte('id', idMaximo);
      if (ultimoId !== null) query = query.lt('id', ultimoId);

      const { data, error: queryError } = await query
        .order('id', { ascending: false })
        .limit(Math.min(lote, totalExportacion - acumulados.length));

      if (queryError) {
        setError(queryError.message || 'No se pudo exportar la auditoría.');
        setExportando(false);
        return;
      }

      const loteActual = (data ?? []) as EventoAuditoria[];
      acumulados.push(...loteActual);
      ultimoId = loteActual.at(-1)?.id ?? null;
      if (loteActual.length < lote) break;
    }

    if (acumulados.length !== totalExportacion) {
      setError(`Los eventos cambiaron durante la exportación (${acumulados.length} de ${totalExportacion}). Volvé a intentarlo para evitar un archivo incompleto.`);
      setExportando(false);
      return;
    }

    const filas = acumulados.map((evento) => ({
      ID: evento.id,
      'Fecha y hora (Argentina)': fechaArgentina(evento.created_at),
      Usuario: evento.actor_email || 'sistema',
      Rol: evento.actor_rol || '—',
      Módulo: evento.modulo,
      Acción: ETIQUETAS_ACCION[evento.accion] || evento.accion,
      Entidad: evento.entidad_tipo,
      'ID entidad': evento.entidad_id || '',
      Superintendencia: evento.superintendencia_nombre || '',
      Resultado: evento.resultado,
      Motivo: evento.motivo || '',
      'Referencia documental': evento.referencia_documental || '',
      Resumen: resumenDetalles(evento.detalles),
    }));

    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja['!cols'] = [
      { wch: 10 }, { wch: 24 }, { wch: 32 }, { wch: 16 }, { wch: 16 },
      { wch: 34 }, { wch: 24 }, { wch: 38 }, { wch: 55 }, { wch: 12 },
      { wch: 55 }, { wch: 55 }, { wch: 55 },
    ];
    const libro = XLSX.utils.book_new();
    const resumen = XLSX.utils.aoa_to_sheet([
      ['Exportación de auditoría COP', ''],
      ['Eventos exportados', acumulados.length],
      ['Total al iniciar la exportación', totalExportacion],
      ['Módulo', filtrosAplicados.modulo],
      ['Desde', filtrosAplicados.desde || 'Sin límite'],
      ['Hasta', filtrosAplicados.hasta || 'Sin límite'],
      ['Búsqueda', termino || 'Sin filtro'],
      ['Generado (Argentina)', fechaArgentina(new Date().toISOString())],
    ]);
    resumen['!cols'] = [{ wch: 33 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(libro, resumen, 'Resumen');
    XLSX.utils.book_append_sheet(libro, hoja, 'Auditoria');
    try {
      XLSX.writeFile(
        libro,
        `auditoria-cop-${filtrosAplicados.desde || 'inicio'}-${filtrosAplicados.hasta || 'actual'}.xlsx`,
      );
      setMensajeExportacion(`${acumulados.length} de ${totalExportacion} eventos exportados. Revisá la hoja Resumen del archivo.`);
    } catch {
      setError('No se pudo generar el archivo Excel. Aplicá filtros más acotados e intentá nuevamente.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="cop-shell min-h-screen text-slate-100">
      <CopAdminHeader active="auditoria" email={miEmail} role="administrador" onLogout={cerrarSesion} loggingOut={cerrandoSesion} />

      <main className="mx-auto max-w-[1500px] space-y-5 px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-5 border-b border-[#26364d] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="cop-module-index mt-1 hidden sm:block">03 / AUDITORÍA</span>
            <span className="hidden h-12 w-px bg-[#26364d] sm:block" />
            <div>
              <p className="cop-kicker mb-2">Control interno · registros inmutables</p>
              <h1 className="text-xl font-black uppercase tracking-[0.035em] text-white sm:text-2xl">Centro de auditoría COP</h1>
              <p className="mt-2 text-xs text-slate-400">Altas, cambios, eliminaciones y decisiones sobre rendiciones. No se registran contraseñas ni tokens.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              onClick={exportarAuditoria}
              disabled={exportando || total === 0 || cerrandoSesion}
              className="cop-action-secondary flex items-center gap-2 px-3 py-2 disabled:opacity-50 sm:px-4"
              title="Exportar auditoría"
              aria-label="Exportar auditoría"
            >
              <Download className="w-4 h-4" />
              <span>{exportando ? 'Exportando...' : 'Exportar auditoría'}</span>
            </button>
          </div>
        </section>

        <section className="space-y-4 border border-[#33465f] bg-[#071426] p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && aplicarFiltros()}
                placeholder="Usuario, acción, ID o superintendencia..."
                className="w-full border border-[#33465f] bg-[#050e1c] py-2.5 pl-10 pr-3 text-xs text-white placeholder-slate-600 focus:border-[#c4a35a] focus:outline-none"
              />
            </div>

            <select
              value={modulo}
              onChange={(event) => setModulo(event.target.value)}
              className="border border-[#33465f] bg-[#050e1c] px-3 py-2.5 text-xs text-white focus:border-[#c4a35a] focus:outline-none"
            >
              <option value="todos">Todos los módulos</option>
              <option value="allanamientos">Allanamientos</option>
              <option value="usuarios">Usuarios</option>
              <option value="seguridad">Seguridad</option>
            </select>

            <input
              type="date"
              value={desde}
              onChange={(event) => setDesde(event.target.value)}
              title="Fecha desde"
              className="border border-[#33465f] bg-[#050e1c] px-3 py-2.5 text-xs text-white focus:border-[#c4a35a] focus:outline-none"
            />
            <input
              type="date"
              value={hasta}
              onChange={(event) => setHasta(event.target.value)}
              title="Fecha hasta"
              className="border border-[#33465f] bg-[#050e1c] px-3 py-2.5 text-xs text-white focus:border-[#c4a35a] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={limpiarFiltros}
              className="cop-action-secondary flex items-center gap-2 px-3 py-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Limpiar
            </button>
            <button
              type="button"
              onClick={aplicarFiltros}
              className="cop-action-primary flex items-center gap-2 px-4 py-2"
            >
              <Filter className="w-3.5 h-3.5" /> Aplicar filtros
            </button>
          </div>
        </section>

        {error && (
          <div className="p-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl">
            {error}
          </div>
        )}
        {mensajeExportacion && (
          <div role="status" className="border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-200">
            {mensajeExportacion}
          </div>
        )}

        <section className="overflow-hidden border border-[#33465f] bg-[#071426]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Fecha / actor</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Entidad</th>
                  <th className="px-4 py-3">Superintendencia</th>
                  <th className="px-4 py-3">Fundamento / referencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {cargando ? (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-500">Consultando auditoría...</td></tr>
                ) : eventos.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-500">No hay eventos para los filtros aplicados.</td></tr>
                ) : eventos.map((evento) => (
                  <tr key={evento.id} className="align-top hover:bg-slate-800/30">
                    <td className="px-4 py-3 min-w-52">
                      <div className="text-white font-medium">{fechaArgentina(evento.created_at)}</div>
                      <div className="text-[11px] text-slate-400 mt-1 break-all">{evento.actor_email || 'sistema'}</div>
                      <div className="mt-0.5 text-[10px] uppercase text-[#c4a35a]">{evento.actor_rol || '—'}</div>
                    </td>
                    <td className="px-4 py-3 min-w-52">
                      <div className="font-semibold text-slate-200">{ETIQUETAS_ACCION[evento.accion] || evento.accion}</div>
                      <div className="text-[10px] text-slate-500 uppercase mt-1">{evento.modulo}</div>
                    </td>
                    <td className="px-4 py-3 min-w-52">
                      <div className="text-slate-300">{evento.entidad_tipo}</div>
                      <div className="text-[10px] text-slate-500 break-all mt-1">{evento.entidad_id || '—'}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{resumenDetalles(evento.detalles)}</div>
                    </td>
                    <td className="px-4 py-3 min-w-64 text-slate-300 leading-relaxed">
                      {evento.superintendencia_nombre || '—'}
                    </td>
                    <td className="px-4 py-3 min-w-72">
                      <div className="text-slate-300 whitespace-pre-wrap">{evento.motivo || '—'}</div>
                      {evento.referencia_documental && (
                        <div className="text-[10px] text-amber-300 mt-2">
                          Ref.: {evento.referencia_documental}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-slate-950/70 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <span>{rangoVisible}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => cargarEventos(pagina - 1)}
                disabled={cargando || pagina <= 1}
                className="cop-action-secondary px-3 py-1.5 disabled:opacity-40"
              >
                Anterior
              </button>
              <span>Página {pagina} de {totalPaginas}</span>
              <button
                type="button"
                onClick={() => cargarEventos(pagina + 1)}
                disabled={cargando || pagina >= totalPaginas}
                className="cop-action-secondary px-3 py-1.5 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
