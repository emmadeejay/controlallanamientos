'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { autorizarExportacionAllanamientosAction } from '@/app/actions/allanamientos'
import { obtenerRangoSemanaRendida, obtenerValoresSecuestros } from '@/lib/allanamientos'
import * as XLSX from 'xlsx'
import {
  Filter, Download, ArrowLeft, Loader2, RefreshCw,
  ShieldAlert, Car, Users, CheckCircle2
} from 'lucide-react'

type Superintendencia = { id: string; nombre: string }
type FiltrosAplicados = {
  desde: string
  hasta: string
  partido: string
  superintendencia: string
  soloArmas: boolean
  soloVehiculos: boolean
  soloPersonas: boolean
  soloPositivos: boolean
}

function fechaArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function inicioMesActual(): string {
  return `${fechaArgentina().slice(0, 7)}-01`
}

export default function BuscarAllanamientosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [registros, setRegistros] = useState<any[]>([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [paginaActual, setPaginaActual] = useState(1)
  const [registrosPorPagina, setRegistrosPorPagina] = useState(25)
  const [mensajeError, setMensajeError] = useState('')
  const [puedeExportar, setPuedeExportar] = useState(false)

  const [partidosList, setPartidosList] = useState<string[]>([])
  const [superintendenciasList, setSuperintendenciasList] = useState<Superintendencia[]>([])

  const [partidoSel, setPartidoSel] = useState('')
  const [superintendenciaSel, setSuperintendenciaSel] = useState('')
  const [fechaDesde, setFechaDesde] = useState(inicioMesActual())
  const [fechaHasta, setFechaHasta] = useState(fechaArgentina())
  const [periodoActivo, setPeriodoActivo] = useState('mes')

  const [soloArmas, setSoloArmas] = useState(false)
  const [soloVehiculos, setSoloVehiculos] = useState(false)
  const [soloDetenidosAprehendidos, setSoloDetenidosAprehendidos] = useState(false)
  const [soloPositivos, setSoloPositivos] = useState(false)
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosAplicados>({
    desde: inicioMesActual(), hasta: fechaArgentina(), partido: '', superintendencia: '',
    soloArmas: false, soloVehiculos: false, soloPersonas: false, soloPositivos: false,
  })

  useEffect(() => {
    void cargarPermisoExportacion()
    void cargarListasMaestras()
    void ejecutarBusqueda(1, registrosPorPagina, {
      desde: inicioMesActual(),
      hasta: fechaArgentina(),
    })
  }, [])

  async function cargarPermisoExportacion() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: perfil } = await supabase
      .from('profiles')
      .select('rol')
      .eq('id', user.id)
      .maybeSingle()

    const rol = String(perfil?.rol ?? '').trim().toLowerCase()
    setPuedeExportar(['admin', 'administrador', 'supervisor'].includes(rol))
  }

  async function cargarListasMaestras() {
    const [partidos, superintendencias] = await Promise.all([
      supabase.from('partidos').select('nombre').order('nombre'),
      supabase.from('superintendencias').select('id, nombre').eq('activa', true).order('nombre'),
    ])

    if (partidos.data) setPartidosList(partidos.data.map((p) => p.nombre))
    if (superintendencias.data) setSuperintendenciasList(superintendencias.data)
  }

  function resolverFiltros(overrides?: Partial<FiltrosAplicados>): FiltrosAplicados {
    return {
      desde: overrides?.desde ?? fechaDesde,
      hasta: overrides?.hasta ?? fechaHasta,
      partido: overrides?.partido ?? partidoSel,
      superintendencia: overrides?.superintendencia ?? superintendenciaSel,
      soloArmas: overrides?.soloArmas ?? soloArmas,
      soloVehiculos: overrides?.soloVehiculos ?? soloVehiculos,
      soloPersonas: overrides?.soloPersonas ?? soloDetenidosAprehendidos,
      soloPositivos: overrides?.soloPositivos ?? soloPositivos,
    }
  }

  function aplicarFiltrosConsulta(query: any, filtros: FiltrosAplicados) {
    if (filtros.desde) query = query.gte('fecha_ejecucion', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha_ejecucion', filtros.hasta)
    if (filtros.partido) query = query.eq('partido', filtros.partido)
    if (filtros.superintendencia) query = query.eq('superintendencia_id', filtros.superintendencia)
    if (filtros.soloArmas) query = query.gt('armas_secuestradas', 0)
    if (filtros.soloVehiculos) query = query.gt('vehiculos_secuestrados', 0)
    if (filtros.soloPersonas) query = query.gt('detenidos_aprehendidos_cant', 0)
    if (filtros.soloPositivos) query = query.ilike('resultado_medida', 'positivo')

    return query
  }

  async function ejecutarBusqueda(
    pagina = 1,
    porPagina = registrosPorPagina,
    overrides?: Partial<FiltrosAplicados>,
  ) {
    const filtros = overrides || pagina === 1 ? resolverFiltros(overrides) : filtrosAplicados

    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      setMensajeError('La fecha desde no puede ser posterior a la fecha hasta.')
      return
    }

    setLoading(true)
    setMensajeError('')
    const indiceDesde = (pagina - 1) * porPagina

    try {
      let query = supabase
        .from('allanamientos')
        .select('*, superintendencias(nombre)', { count: 'exact' })
        .order('fecha_ejecucion', { ascending: false })
        .order('created_at', { ascending: false })
        .range(indiceDesde, indiceDesde + porPagina - 1)

      query = aplicarFiltrosConsulta(query, filtros)
      const { data, error, count } = await query
      if (error) throw error

      setRegistros(data ?? [])
      setTotalRegistros(count ?? 0)
      setPaginaActual(pagina)
      setFiltrosAplicados(filtros)
    } catch (error) {
      console.error('Error al filtrar allanamientos:', error)
      setRegistros([])
      setTotalRegistros(0)
      setMensajeError('No se pudo completar la consulta. Intentá nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  function aplicarPresetFecha(tipo: 'semana' | 'mes') {
    const rango = tipo === 'semana'
      ? obtenerRangoSemanaRendida()
      : { inicio: inicioMesActual(), fin: fechaArgentina() }

    setFechaDesde(rango.inicio)
    setFechaHasta(rango.fin)
    setPeriodoActivo(tipo)
    void ejecutarBusqueda(1, registrosPorPagina, { desde: rango.inicio, hasta: rango.fin })
  }

  function resetearFiltros() {
    const desde = inicioMesActual()
    const hasta = fechaArgentina()
    setPartidoSel('')
    setSuperintendenciaSel('')
    setSoloArmas(false)
    setSoloVehiculos(false)
    setSoloDetenidosAprehendidos(false)
    setSoloPositivos(false)
    setFechaDesde(desde)
    setFechaHasta(hasta)
    setPeriodoActivo('mes')
    void ejecutarBusqueda(1, registrosPorPagina, {
      desde, hasta, partido: '', superintendencia: '',
      soloArmas: false, soloVehiculos: false, soloPersonas: false, soloPositivos: false,
    })
  }

  async function obtenerTodosParaExportar(): Promise<any[]> {
    const lote = 1000
    const acumulados: any[] = []
    let desde = 0
    let totalEsperado: number | null = null

    do {
      let query = supabase
        .from('allanamientos')
        .select('*, superintendencias(nombre)', { count: desde === 0 ? 'exact' : undefined })
        .order('fecha_ejecucion', { ascending: false })
        .order('created_at', { ascending: false })
        .range(desde, desde + lote - 1)

      query = aplicarFiltrosConsulta(query, filtrosAplicados)
      const { data, error, count } = await query
      if (error) throw error

      if (desde === 0) totalEsperado = count ?? 0
      acumulados.push(...(data ?? []))
      desde += lote
    } while (totalEsperado !== null && acumulados.length < totalEsperado)

    return acumulados
  }

  async function exportarExcel() {
    if (totalRegistros === 0 || exportando) return
    setExportando(true)
    setMensajeError('')

    try {
      const autorizacion = await autorizarExportacionAllanamientosAction({
        ...filtrosAplicados,
        cantidad: totalRegistros,
      })
      if (!autorizacion.success) {
        throw new Error(autorizacion.error)
      }

      const todos = await obtenerTodosParaExportar()
      const datos = todos.map((item) => {
        const v = obtenerValoresSecuestros(item)
        return {
          'Superintendencia': item.superintendencias?.nombre || 'S/D',
          'IPP': item.numero_ipp || 'S/D',
          'Carátula / Causa': item.caratula || 'S/D',
          'UFI / Juzgado': item.ufi_juzgado || 'S/D',
          'Fecha Solicitud': item.fecha_solicitud || '',
          'Fecha Ejecución': item.fecha_ejecucion || '',
          'Hora Ejecución': item.horario_ejecucion || '',
          'Partido': item.partido || 'S/D',
          'Departamental': item.departamental || '',
          'Dependencia': item.dependencia || '',
          'Lugar Presentación': item.lugar_presentacion || '',
          'Orden Servicio Propia': item.orden_servicio_propia || '',
          'Orden Servicio C.O.P.': item.orden_servicio_cop || '',
          'Parte Urgente': item.numero_parte_urgente || '',
          'Objetivos': Number(item.objetivos) || 0,
          'Personal Propio': Number(item.personal_propio) || 0,
          'Resultado Medida': item.resultado_medida || 'N/A',
          'Resultado Secuestros': item.resultado_secuestros || 'N/A',
          'Total Armas': v.totalArmas,
          'Armas Cortas': v.corta,
          'Armas Largas': v.larga,
          'Armas Blancas': v.blanca,
          'Réplicas': v.replica,
          'Total Vehículos': v.totalVehiculos,
          'Autos': v.autos,
          'Motos': v.motos,
          'Camionetas': v.camionetas,
          'Otros Vehículos': v.otrosVeh,
          'Total Personas': v.totalPersonas,
          'Detenidos': v.detenidos,
          'Aprehendidos': v.aprehendidos,
          'Observaciones': item.observaciones || '',
        }
      })

      const worksheet = XLSX.utils.aoa_to_sheet([
        ['DIRECCIÓN CENTRO DE OPERACIONES POLICIALES · REPORTE DE ALLANAMIENTOS'],
        [`Período: ${filtrosAplicados.desde || 'inicio'} al ${filtrosAplicados.hasta || 'actualidad'}`],
        [`Registros exportados: ${datos.length} · Generado: ${new Date().toLocaleString('es-AR')}`],
        [],
      ])
      XLSX.utils.sheet_add_json(worksheet, datos, { origin: 'A5' })
      worksheet['!merges'] = [
        XLSX.utils.decode_range('A1:AF1'),
        XLSX.utils.decode_range('A2:AF2'),
        XLSX.utils.decode_range('A3:AF3'),
      ]
      worksheet['!autofilter'] = { ref: `A5:AF${datos.length + 5}` }
      worksheet['!cols'] = Array.from({ length: 32 }, (_, indice) => ({
        wch: indice === 0 || indice === 2 || indice === 31 ? 34 : indice === 1 ? 16 : 15,
      }))

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Allanamientos')
      XLSX.writeFile(workbook, `Allanamientos_${filtrosAplicados.desde || 'inicio'}_${filtrosAplicados.hasta || 'actualidad'}.xlsx`)
    } catch (error) {
      console.error('Error al exportar allanamientos:', error)
      setMensajeError('No se pudo generar el Excel completo. Intentá nuevamente.')
    } finally {
      setExportando(false)
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / registrosPorPagina))
  const indiceInicial = (paginaActual - 1) * registrosPorPagina

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 gap-4">
          <div className="flex items-center space-x-3">
            <button onClick={() => router.push('/allanamientos')} className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Filter className="w-5 h-5 text-blue-500" /> Consultas y Reportes Operativos
              </h1>
              <p className="text-xs text-slate-400">Consulta histórica paginada y exportación completa a Excel.</p>
            </div>
          </div>

          {puedeExportar && (
            <button
              onClick={exportarExcel}
              disabled={totalRegistros === 0 || exportando}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-950/20"
            >
              {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exportando ? 'Generando Excel completo...' : `Exportar (${totalRegistros})`}
            </button>
          )}
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4 backdrop-blur-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Período de análisis</label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => aplicarPresetFecha('semana')} className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${periodoActivo === 'semana' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                  Semana rendida
                </button>
                <button type="button" onClick={() => aplicarPresetFecha('mes')} className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${periodoActivo === 'mes' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                  Mes actual
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Partido</label>
              <select value={partidoSel} onChange={(e) => setPartidoSel(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
                <option value="">Todos los partidos</option>
                {partidosList.map((partido) => <option key={partido} value={partido}>{partido}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Superintendencia</label>
              <select value={superintendenciaSel} onChange={(e) => setSuperintendenciaSel(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
                <option value="">Todas las superintendencias</option>
                {superintendenciasList.map((superintendencia) => <option key={superintendencia.id} value={superintendencia.id}>{superintendencia.nombre}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Fecha desde / hasta</label>
              <div className="flex items-center gap-1">
                <input type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPeriodoActivo('') }} className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white [color-scheme:dark]" />
                <input type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPeriodoActivo('') }} className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white [color-scheme:dark]" />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-slate-400 mr-1">Contenido:</span>
              <Chip activo={soloArmas} onClick={() => setSoloArmas(!soloArmas)} color="red" icon={<ShieldAlert className="w-3.5 h-3.5" />}>Con armas</Chip>
              <Chip activo={soloVehiculos} onClick={() => setSoloVehiculos(!soloVehiculos)} color="sky" icon={<Car className="w-3.5 h-3.5" />}>Con vehículos</Chip>
              <Chip activo={soloDetenidosAprehendidos} onClick={() => setSoloDetenidosAprehendidos(!soloDetenidosAprehendidos)} color="purple" icon={<Users className="w-3.5 h-3.5" />}>Con personas</Chip>
              <Chip activo={soloPositivos} onClick={() => setSoloPositivos(!soloPositivos)} color="emerald" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>Solo positivos</Chip>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={resetearFiltros} className="px-3 py-2 bg-slate-950 text-slate-400 hover:text-white border border-slate-800 rounded-xl text-xs transition flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Restablecer
              </button>
              <button onClick={() => void ejecutarBusqueda(1)} disabled={loading} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-blue-950/30">
                <Filter className="w-3.5 h-3.5" /> Aplicar filtros
              </button>
            </div>
          </div>
        </div>

        {mensajeError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">{mensajeError}</div>}

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/90 uppercase text-[10px] text-slate-400 border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="py-3 px-4">IPP / ubicación / fecha</th>
                  <th className="py-3 px-4">Superintendencia</th>
                  <th className="py-3 px-4">Personas</th>
                  <th className="py-3 px-4">Armas</th>
                  <th className="py-3 px-4">Vehículos</th>
                  <th className="py-3 px-4 text-center">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {loading ? (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400"><span className="inline-flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /> Cargando registros...</span></td></tr>
                ) : registros.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400">Sin registros para los filtros seleccionados.</td></tr>
                ) : registros.map((item) => {
                  const valores = obtenerValoresSecuestros(item)
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{item.numero_ipp || 'S/D'} · {item.partido || 'S/D'}</div>
                        <div className="text-[10px] text-slate-400">{item.fecha_ejecucion}</div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs"><span className="whitespace-normal break-words text-[11px]">{item.superintendencias?.nombre || 'S/D'}</span></td>
                      <Total valor={valores.totalPersonas} color="text-purple-400" />
                      <Total valor={valores.totalArmas} color="text-red-400" />
                      <Total valor={valores.totalVehiculos} color="text-sky-400" />
                      <td className="py-3.5 px-4 text-center"><span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${String(item.resultado_medida).toLowerCase().includes('posi') ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-red-950/80 text-red-400 border border-red-800'}`}>{item.resultado_medida || 'N/A'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!loading && totalRegistros > 0 && (
            <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-3">
                <span>Mostrando <strong className="text-white">{indiceInicial + 1}</strong> a <strong className="text-white">{Math.min(indiceInicial + registros.length, totalRegistros)}</strong> de <strong className="text-white">{totalRegistros}</strong></span>
                <select value={registrosPorPagina} onChange={(e) => { const cantidad = Number(e.target.value); setRegistrosPorPagina(cantidad); void ejecutarBusqueda(1, cantidad, filtrosAplicados) }} className="bg-slate-900 border border-slate-800 text-slate-300 text-[11px] rounded-lg px-2 py-1">
                  <option value={25}>25 por pág.</option><option value={50}>50 por pág.</option><option value={100}>100 por pág.</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => void ejecutarBusqueda(paginaActual - 1)} disabled={paginaActual === 1} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg">Anterior</button>
                <span>Página {paginaActual} de {totalPaginas}</span>
                <button onClick={() => void ejecutarBusqueda(paginaActual + 1)} disabled={paginaActual >= totalPaginas} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Chip({ activo, onClick, color, icon, children }: { activo: boolean; onClick: () => void; color: 'red' | 'sky' | 'purple' | 'emerald'; icon: ReactNode; children: ReactNode }) {
  const activos = {
    red: 'bg-red-950/80 border-red-800 text-red-300',
    sky: 'bg-sky-950/80 border-sky-800 text-sky-300',
    purple: 'bg-purple-950/80 border-purple-800 text-purple-300',
    emerald: 'bg-emerald-950/80 border-emerald-800 text-emerald-300',
  }
  return <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 ${activo ? activos[color] : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'}`}>{icon}{children}</button>
}

function Total({ valor, color }: { valor: number; color: string }) {
  return <td className="py-3.5 px-4"><span className="bg-slate-950 border border-slate-800/80 px-2.5 py-1 rounded-lg text-xs font-medium">Total: <strong className={color}>{valor}</strong></span></td>
}
