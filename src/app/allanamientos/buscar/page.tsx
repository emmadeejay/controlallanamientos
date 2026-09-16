'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { 
  Search, Filter, Download, Edit3, Eye, ArrowLeft, 
  Calendar, MapPin, ShieldAlert, Loader2, RefreshCw 
} from 'lucide-react'

export default function BuscarAllanamientosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [registros, setRegistros] = useState<any[]>([])

  // Listas para los combos de filtro
  const [partidosList, setPartidosList] = useState<string[]>([])
  const [especialidadesList, setEspecialidadesList] = useState<string[]>([])

  // Filtros de búsqueda
  const [busquedaGral, setBusquedaGral] = useState('')
  const [partidoSel, setPartidoSel] = useState('')
  const [especialidadSel, setEspecialidadSel] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [periodoAcceso, setPeriodoAcceso] = useState('') // 'semana' | 'mes' | ''

  useEffect(() => {
    cargarListasMaestras()
    ejecutarBusqueda()
  }, [])

  async function cargarListasMaestras() {
    const { data: partData } = await supabase.from('partidos').select('nombre').order('nombre')
    if (partData) setPartidosList(partData.map(p => p.nombre))

    const { data: espData } = await supabase.from('especialidades').select('nombre').order('nombre')
    if (espData) setEspecialidadesList(espData.map(e => e.nombre))
  }

  // Manejo de atajos temporales (Esta Semana / Este Mes)
  const aplicarPresetFecha = (tipo: 'semana' | 'mes') => {
    const hoy = new Date()
    let desde = new Date()

    if (tipo === 'semana') {
      const diaSemana = hoy.getDay() // 0 dom, 1 lun...
      const diff = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1)
      desde = new Date(hoy.setDate(diff))
    } else if (tipo === 'mes') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    }

    setFechaDesde(desde.toISOString().split('T')[0])
    setFechaHasta(new Date().toISOString().split('T')[0])
    setPeriodoAcceso(tipo)
  }

  const resetearFiltros = () => {
    setBusquedaGral('')
    setPartidoSel('')
    setEspecialidadSel('')
    setFechaDesde('')
    setFechaHasta('')
    setPeriodoAcceso('')
  }

  const ejecutarBusqueda = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('allanamientos')
        .select(`
          *,
          superintendencias (nombre),
          allanamiento_colaboraciones (especialidad, cant_solicitada, cant_afectada)
        `)
        .order('fecha_ejecucion', { ascending: false })

      if (partidoSel) {
        query = query.eq('partido', partidoSel)
      }

      if (fechaDesde) {
        query = query.gte('fecha_ejecucion', fechaDesde)
      }

      if (fechaHasta) {
        query = query.lte('fecha_ejecucion', fechaHasta)
      }

      const { data, error } = await query
      if (error) throw error

      let resultados = data || []

      // Filtro local por Texto Libre (IPP, Carátula, Dependencia)
      if (busquedaGral.trim()) {
        const q = busquedaGral.toLowerCase()
        resultados = resultados.filter(item => 
          item.numero_ipp?.toLowerCase().includes(q) ||
          item.caratula?.toLowerCase().includes(q) ||
          item.dependencia?.toLowerCase().includes(q) ||
          item.superintendencias?.nombre?.toLowerCase().includes(q)
        )
      }

      // Filtro por Especialidad en tabla relacionada
      if (especialidadSel) {
        resultados = resultados.filter(item => 
          item.allanamiento_colaboraciones?.some((col: any) => col.especialidad === especialidadSel)
        )
      }

      setRegistros(resultados)
    } catch (err) {
      console.error('Error buscando allanamientos:', err)
    } finally {
      setLoading(false)
    }
  }

  // Exportar los registros filtrados a formato Excel
  const exportarExcel = () => {
    if (registros.length === 0) return

    const datosAExportar = registros.map(item => ({
      'IPP': item.numero_ipp,
      'Carátula': item.caratula,
      'UFI / Juzgado': item.ufi_juzgado,
      'Superintendencia': item.superintendencias?.nombre || 'N/A',
      'Partido': item.partido,
      'Dependencia': item.dependencia,
      'Fecha Ejecución': item.fecha_ejecucion,
      'Horario': item.horario_ejecucion,
      'Resultado Medida': item.resultado_medida,
      'Objetivos': item.cantidad_objetivos,
      'Personal Propio': item.personal_propio,
      'Resultado Secuestros': item.resultado_secuestros,
      'Armas': item.armas_secuestradas,
      'Vehículos': item.vehiculos_secuestrados,
      'Detenidos': item.detenidos_aprehendidos,
      'Orden Serv. Propia': item.orden_servicio_propia,
      'Orden Serv. COP': item.orden_servicio_cop,
      'Parte Urgente': item.numero_parte_urgente,
      'Observaciones': item.observaciones
    }))

    const worksheet = XLSX.utils.json_to_sheet(datosAExportar)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Allanamientos')
    XLSX.writeFile(workbook, `Reporte_Allanamientos_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => router.push('/allanamientos')}
              className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <Search className="w-6 h-6 text-blue-500" /> Consultas y Filtros Avanzados
              </h1>
              <p className="text-sm text-slate-400">Filtre información específica y genere reportes descargables.</p>
            </div>
          </div>

          <button
            onClick={exportarExcel}
            disabled={registros.length === 0}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Exportar a Excel ({registros.length})
          </button>
        </div>

        {/* Panel de Filtros */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 backdrop-blur-md">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Búsqueda General */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Buscar por IPP, Carátula o Lote</label>
              <input
                type="text"
                placeholder="Escriba aquí..."
                value={busquedaGral}
                onChange={(e) => setBusquedaGral(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Partido */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Partido</label>
              <select
                value={partidoSel}
                onChange={(e) => setPartidoSel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">Todos los Partidos</option>
                {partidosList.map((p, idx) => (
                  <option key={idx} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Especialidad */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Especialidad Colaboradora</label>
              <select
                value={especialidadSel}
                onChange={(e) => setEspecialidadSel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">Todas las Especialidades</option>
                {especialidadesList.map((e, idx) => (
                  <option key={idx} value={e}>{e}</option>
                ))}
              </select>
            </div>

            {/* Presets Rápidos de Fecha */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Rango Rápido</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => aplicarPresetFecha('semana')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${
                    periodoAcceso === 'semana'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Esta Semana
                </button>
                <button
                  type="button"
                  onClick={() => aplicarPresetFecha('mes')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${
                    periodoAcceso === 'mes'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Este Mes
                </button>
              </div>
            </div>

            {/* Fecha Desde */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Fecha Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => { setFechaDesde(e.target.value); setPeriodoAcceso('') }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
              />
            </div>

            {/* Fecha Hasta */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Fecha Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => { setFechaHasta(e.target.value); setPeriodoAcceso('') }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
              />
            </div>

          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-800/80">
            <button
              onClick={resetearFiltros}
              className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Limpiar Filtros
            </button>
            <button
              onClick={ejecutarBusqueda}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-md shadow-blue-600/20"
            >
              <Filter className="w-3.5 h-3.5" /> Aplicar Filtros
            </button>
          </div>
        </div>

        {/* Tabla de Resultados */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">IPP / Carátula</th>
                  <th className="py-3.5 px-4 font-semibold">Superintendencia</th>
                  <th className="py-3.5 px-4 font-semibold">Ubicación</th>
                  <th className="py-3.5 px-4 font-semibold">Ejecución</th>
                  <th className="py-3.5 px-4 font-semibold">Resultado</th>
                  <th className="py-3.5 px-4 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        <span>Cargando registros...</span>
                      </div>
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No se encontraron resultados con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  registros.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-blue-400">{item.numero_ipp}</div>
                        <div className="text-xs text-slate-400 line-clamp-1">{item.caratula}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-300">
                          {item.superintendencias?.nombre || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-200 font-medium">{item.partido}</div>
                        <div className="text-xs text-slate-400">{item.dependencia}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-200">{item.fecha_ejecucion}</div>
                        <div className="text-xs text-slate-400">{item.horario_ejecucion} hs</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          item.resultado_medida === 'Positivo' 
                            ? 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-400' 
                            : 'bg-red-950/60 border border-red-800/60 text-red-400'
                        }`}>
                          {item.resultado_medida}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => router.push(`/allanamientos/editar/${item.id}`)}
                          className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-950/30 rounded-lg transition"
                          title="Editar Allanamiento"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
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