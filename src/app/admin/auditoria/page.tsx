'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Filter,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

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
  cambiar_password_obligatorio: 'Cambio obligatorio de contraseña',
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
  const router = useRouter();
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
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

  async function exportarAuditoria() {
    setExportando(true);
    setError(null);

    const acumulados: EventoAuditoria[] = [];
    const lote = 1000;
    const limiteSeguro = 20000;

    for (let inicio = 0; inicio < limiteSeguro; inicio += lote) {
      let query = supabase
        .from('auditoria_eventos')
        .select('id, created_at, actor_email, actor_rol, modulo, accion, entidad_tipo, entidad_id, superintendencia_nombre, resultado, motivo, referencia_documental, detalles');

      if (filtrosAplicados.modulo !== 'todos') query = query.eq('modulo', filtrosAplicados.modulo);
      if (filtrosAplicados.desde) query = query.gte('created_at', `${filtrosAplicados.desde}T00:00:00-03:00`);
      if (filtrosAplicados.hasta) query = query.lte('created_at', `${filtrosAplicados.hasta}T23:59:59.999-03:00`);

      const termino = limpiarBusqueda(filtrosAplicados.busqueda);
      if (termino) {
        query = query.or(
          `actor_email.ilike.%${termino}%,accion.ilike.%${termino}%,entidad_id.ilike.%${termino}%,superintendencia_nombre.ilike.%${termino}%`,
        );
      }

      const { data, error: queryError } = await query
        .order('created_at', { ascending: false })
        .range(inicio, inicio + lote - 1);

      if (queryError) {
        setError(queryError.message || 'No se pudo exportar la auditoría.');
        setExportando(false);
        return;
      }

      const loteActual = (data ?? []) as EventoAuditoria[];
      acumulados.push(...loteActual);
      if (loteActual.length < lote) break;
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
    XLSX.utils.book_append_sheet(libro, hoja, 'Auditoria');
    XLSX.writeFile(
      libro,
      `auditoria-cop-${filtrosAplicados.desde || 'inicio'}-${filtrosAplicados.hasta || 'actual'}.xlsx`,
    );
    setExportando(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => router.push('/select-app')}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300"
              title="Volver a módulos"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-white text-sm sm:text-base truncate">Centro de Auditoría COP</h1>
              <p className="text-[10px] text-slate-400">Acceso exclusivo de Administrador · registros inmutables</p>
            </div>
          </div>

          <button
            type="button"
            onClick={exportarAuditoria}
            disabled={exportando || total === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-xs font-semibold"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{exportando ? 'Exportando...' : 'Exportar auditoría'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">Trazabilidad del sistema</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Altas, cambios, eliminaciones y decisiones sobre rendiciones. No se registran contraseñas ni tokens.
          </p>
        </div>

        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && aplicarFiltros()}
                placeholder="Usuario, acción, ID o superintendencia..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <select
              value={modulo}
              onChange={(event) => setModulo(event.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
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
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
            <input
              type="date"
              value={hasta}
              onChange={(event) => setHasta(event.target.value)}
              title="Fecha hasta"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={limpiarFiltros}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Limpiar
            </button>
            <button
              type="button"
              onClick={aplicarFiltros}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl"
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

        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
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
                      <div className="text-[10px] text-cyan-400 uppercase mt-0.5">{evento.actor_rol || '—'}</div>
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
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-white"
              >
                Anterior
              </button>
              <span>Página {pagina} de {totalPaginas}</span>
              <button
                type="button"
                onClick={() => cargarEventos(pagina + 1)}
                disabled={cargando || pagina >= totalPaginas}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-white"
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
