'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { 
  Filter, Download, ArrowLeft, Loader2, RefreshCw, Calendar
} from 'lucide-react'

export default function BuscarAllanamientosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [registros, setRegistros] = useState<any[]>([])

  // Listas para Selects
  const [partidosList, setPartidosList] = useState<string[]>([])
  const [superintendenciasList, setSuperintendenciasList] = useState<{ id: string; nombre: string }[]>([])
  const [especialidadesList, setEspecialidadesList] = useState<{ id: string; nombre: string }[]>([])

  // Estado de Filtros
  const [partidoSel, setPartidoSel] = useState('')
  const [superintendenciaSel, setSuperintendenciaSel] = useState('')
  const [especialidadSel, setEspecialidadSel] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [periodoActivo, setPeriodoActivo] = useState('')

  useEffect(() => {
    cargarListasMaestras()
    // Por defecto al entrar carga la semana en curso
    aplicarPresetFecha('semana')
  }, [])

  async function cargarListasMaestras() {
    const { data: partData } = await supabase.from('partidos').select('nombre').order('nombre')
    if (partData) setPartidosList(partData.map(p => p.nombre))

    const { data: supData } = await supabase.from('superintendencias').select('id, nombre').order('nombre')
    if (supData) setSuperintendenciasList(supData || [])

    const { data: espData } = await supabase.from('especialidades').select('id, nombre').order('nombre')
    if (espData) setEspecialidadesList(espData || [])
  }

  const aplicarPresetFecha = (tipo: 'semana' | 'mes') => {
    const hoy = new Date()
    let desde = new Date()

    if (tipo === 'semana') {
      const diaSemana = hoy.getDay()
      const diff = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1)
      desde = new Date(hoy.setDate(diff))
    } else if (tipo === 'mes') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    }

    const fDesdeStr = desde.toISOString().split('T')[0]
    const fHastaStr = new Date().toISOString().split('T')[0]

    setFechaDesde(fDesdeStr)
    setFechaHasta(fHastaStr)
    setPeriodoActivo(tipo)

    ejecutarBusqueda({ desde: fDesdeStr, hasta: fHastaStr, partido: partidoSel, sup: superintendenciaSel, esp: especialidadSel })
  }

  const resetearFiltros = () => {
    setPartidoSel('')
    setSuperintendenciaSel('')
    setEspecialidadSel('')
    setFechaDesde('')
    setFechaHasta('')
    setPeriodoActivo('')
    ejecutarBusqueda({ desde: '', hasta: '', partido: '', sup: '', esp: '' })
  }

  const ejecutarBusqueda = async (overrides?: any) => {
    setLoading(true)

    const fDesde = overrides?.desde !== undefined ? overrides.desde : fechaDesde
    const fHasta = overrides?.hasta !== undefined ? overrides.hasta : fechaHasta
    const part = overrides?.partido !== undefined ? overrides.partido : partidoSel
    const sup = overrides?.sup !== undefined ? overrides.sup : superintendenciaSel
    const esp = overrides?.esp !== undefined ? overrides.esp : especialidadSel

    try {
      let query = supabase
        .from('allanamientos')
        .select(`
          *,
          superintendencias (nombre),
          especialidades (nombre)
        `)
        .order('fecha_ejecucion', { ascending: false })

      if (fDesde) query = query.gte('fecha_ejecucion', fDesde)
      if (fHasta) query = query.lte('fecha_ejecucion', fHasta)
      if (part) query = query.eq('partido', part)
      if (sup) query = query.eq('superintendencia_id', sup)
      if (esp) query = query.eq('especialidad_id', esp)

      const { data, error } = await query
      if (error) throw error

      setRegistros(data || [])
    } catch (err) {
      console.error('Error al filtrar allanamientos:', err)
    } finally {
      setLoading(false)
    }
  }

  const exportarExcel = () => {
    if (registros.length === 0) return

    const datosAExportar = registros.map(item => ({
      'Superintendencia': item.superintendencias?.nombre || 'N/A',
      'Especialidad': item.especialidades?.nombre || 'N/A',
      'Partido': item.partido,
      'Fecha Ejecución': item.fecha_ejecucion,
      'Resultado Medida': item.resultado_medida,
      'Detenidos': item.detenidos || 0,
      'Aprehendidos': item.aprehendidos || 0,
      'Armas Cortas': item.armas_cortas || 0,
      'Armas Largas': item.armas_largas || 0,
      'Armas Blancas': item.armas_blancas || 0,
      'Réplicas': item.replicas_armas || 0,
      'Autos': item.autos_secuestrados || 0,
      'Motos': item.motos_secuestradas || 0,
      'Camionetas': item.camionetas_secuestradas || 0,
      'Otros Vehículos': item.otros_vehiculos_secuestrados || 0,
    }))

    const worksheet = XLSX.utils.json_to_sheet(datosAExportar)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte')
    XLSX.writeFile(workbook, `Allanamientos_Reporte_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => router.push('/allanamientos')}
              className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Filter className="w-5 h-5 text-blue-500" /> Consultas y Reportes
              </h1>
              <p className="text-xs text-slate-400">Filtrado rápido por fechas, zonas y desgloses de secuestros.</p>
            </div>
          </div>

          <button
            onClick={exportarExcel}
            disabled={registros.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Exportar ({registros.length})
          </button>
        </div>

        {/* Panel Filtros Reducido */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">

            {/* Rango Rápido */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Rango Rápido</label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => aplicarPresetFecha('semana')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition ${
                    periodoActivo === 'semana'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Esta Semana
                </button>
                <button
                  type="button"
                  onClick={() => aplicarPresetFecha('mes')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition ${
                    periodoActivo === 'mes'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Este Mes
                </button>
              </div>
            </div>

            {/* Partido */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Partido</label>
              <select
                value={partidoSel}
                onChange={(e) => setPartidoSel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">Todos los Partidos</option>
                {partidosList.map((p, idx) => (
                  <option key={idx} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Superintendencia */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Superintendencia</label>
              <select
                value={superintendenciaSel}
                onChange={(e) => setSuperintendenciaSel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">Todas</option>
                {superintendenciasList.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            {/* Especialidad */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Especialidad Colaboradora</label>
              <select
                value={especialidadSel}
                onChange={(e) => setEspecialidadSel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">Todas</option>
                {especialidadesList.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>

            {/* Fechas Manuales */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Fecha Desde / Hasta</label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => { setFechaDesde(e.target.value); setPeriodoActivo('') }}
                  className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white [color-scheme:dark]"
                />
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => { setFechaHasta(e.target.value); setPeriodoActivo('') }}
                  className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white [color-scheme:dark]"
                />
              </div>
            </div>

          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/60">
            <button
              onClick={resetearFiltros}
              className="px-3 py-1.5 bg-slate-950 text-slate-400 hover:text-white border border-slate-800 rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Limpiar
            </button>
            <button
              onClick={() => ejecutarBusqueda()}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5" /> Aplicar Filtros
            </button>
          </div>
        </div>

        {/* Tabla compacta con desgloses */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 uppercase text-[10px] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Ubicación / Fecha</th>
                  <th className="py-3 px-3">Superintendencia / Esp.</th>
                  <th className="py-3 px-3">Personas APREH. / DET.</th>
                  <th className="py-3 px-3">Armas Secuestradas</th>
                  <th className="py-3 px-3">Vehículos Secuestrados</th>
                  <th className="py-3 px-3 text-center">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      <div className="flex justify-center items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                        <span>Procesando registros...</span>
                      </div>
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      Sin registros para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  registros.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{item.partido}</div>
                        <div className="text-[10px] text-slate-400">{item.fecha_ejecucion}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-slate-200">{item.superintendencias?.nombre || 'N/A'}</div>
                        <div className="text-[10px] text-slate-400">{item.especialidades?.nombre || 'Sin especialidad'}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex gap-2">
                          <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-[11px]">
                            Detenidos: <strong className="text-blue-400">{item.detenidos || 0}</strong>
                          </span>
                          <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-[11px]">
                            Aprehendidos: <strong className="text-emerald-400">{item.aprehendidos || 0}</strong>
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-[11px] text-slate-300 space-x-1">
                          <span>Corta: <strong>{item.armas_cortas || 0}</strong> |</span>
                          <span>Larga: <strong>{item.armas_largas || 0}</strong> |</span>
                          <span>Blanca: <strong>{item.armas_blancas || 0}</strong> |</span>
                          <span>Réplica: <strong>{item.replicas_armas || 0}</strong></span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-[11px] text-slate-300 space-x-1">
                          <span>Auto: <strong>{item.autos_secuestrados || 0}</strong> |</span>
                          <span>Moto: <strong>{item.motos_secuestradas || 0}</strong> |</span>
                          <span>Camioneta: <strong>{item.camionetas_secuestradas || 0}</strong> |</span>
                          <span>Otro: <strong>{item.otros_vehiculos_secuestrados || 0}</strong></span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.resultado_medida === 'Positivo' 
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' 
                            : 'bg-red-950/80 text-red-400 border border-red-800'
                        }`}>
                          {item.resultado_medida}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}