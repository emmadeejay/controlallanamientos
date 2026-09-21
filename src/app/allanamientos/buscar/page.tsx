'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { obtenerValoresSecuestros } from '@/lib/allanamientos'
import * as XLSX from 'xlsx'
import { 
  Filter, Download, ArrowLeft, Loader2, RefreshCw, 
  ShieldAlert, Car, Users, CheckCircle2 
} from 'lucide-react'

export default function BuscarAllanamientosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [registros, setRegistros] = useState<any[]>([])

  // Listas para Selects
  const [partidosList, setPartidosList] = useState<string[]>([])

  // Estado de Filtros Principales
  const [partidoSel, setPartidoSel] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [periodoActivo, setPeriodoActivo] = useState('mes')

  // Filtros de Resultados Rápidos (Chips)
  const [soloArmas, setSoloArmas] = useState(false)
  const [soloVehiculos, setSoloVehiculos] = useState(false)
  const [soloDetenidosAprehendidos, setSoloDetenidosAprehendidos] = useState(false)
  const [soloPositivos, setSoloPositivos] = useState(false)

  useEffect(() => {
    cargarListasMaestras()
    aplicarPresetFecha('mes')
  }, [])

  async function cargarListasMaestras() {
    try {
      const { data: partData } = await supabase.from('partidos').select('nombre').order('nombre')
      if (partData) setPartidosList(partData.map(p => p.nombre))
    } catch (e) {
      console.warn("No se pudo cargar la lista de partidos:", e)
    }
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

    ejecutarBusqueda({ desde: fDesdeStr, hasta: fHastaStr })
  }

  const resetearFiltros = () => {
    setPartidoSel('')
    setSoloArmas(false)
    setSoloVehiculos(false)
    setSoloDetenidosAprehendidos(false)
    setSoloPositivos(false)
    setFechaDesde('')
    setFechaHasta('')
    setPeriodoActivo('')
    ejecutarBusqueda({ desde: '', hasta: '', partido: '' })
  }

  const obtenerValores = (item: any) => obtenerValoresSecuestros(item)

  const ejecutarBusqueda = async (overrides?: any) => {
    setLoading(true)

    const fDesde = overrides?.desde !== undefined ? overrides.desde : fechaDesde
    const fHasta = overrides?.hasta !== undefined ? overrides.hasta : fechaHasta
    const part = overrides?.partido !== undefined ? overrides.partido : partidoSel

    try {
      // Hacemos el join correcto con la tabla superintendencias usando superintendencia_id
      let query = supabase
        .from('allanamientos')
        .select(`
          *,
          superintendencias (
            nombre
          )
        `)
        .order('fecha_ejecucion', { ascending: false })

      if (fDesde) query = query.gte('fecha_ejecucion', fDesde)
      if (fHasta) query = query.lte('fecha_ejecucion', fHasta)
      if (part) query = query.eq('partido', part)
      if (soloPositivos) query = query.ilike('resultado_medida', '%positivo%')

      const { data, error } = await query
      if (error) throw error

      let resultadosFiltrados = data || []

      if (soloArmas) {
        resultadosFiltrados = resultadosFiltrados.filter(item => obtenerValores(item).totalArmas > 0)
      }
      if (soloVehiculos) {
        resultadosFiltrados = resultadosFiltrados.filter(item => obtenerValores(item).totalVehiculos > 0)
      }
      if (soloDetenidosAprehendidos) {
        resultadosFiltrados = resultadosFiltrados.filter(item => obtenerValores(item).totalPersonas > 0)
      }

      setRegistros(resultadosFiltrados)
    } catch (err) {
      console.error('Error al filtrar allanamientos:', err)
    } finally {
      setLoading(false)
    }
  }

  const exportarExcel = () => {
    if (registros.length === 0) return

    const datosAExportar = registros.map(item => {
      const v = obtenerValores(item)
      
      // Obtenemos el nombre de la superintendencia desde la relación
      const nombreSuper = item.superintendencias?.nombre || 'S/D'

      return {
        'Superintendencia': nombreSuper,
        'Partido': item.partido || 'S/D',
        'Fecha Ejecución': item.fecha_ejecucion || 'S/D',
        'Resultado Medida': item.resultado_medida || 'N/A',
        'Total Personas': v.totalPersonas,
        'Detenidos': v.detenidos,
        'Aprehendidos': v.aprehendidos,
        'Total Armas': v.totalArmas,
        'Armas Cortas': v.corta,
        'Armas Largas': v.larga,
        'Total Vehículos': v.totalVehiculos,
        'Autos': v.autos,
        'Motos': v.motos,
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(datosAExportar)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte_Allanamientos')
    XLSX.writeFile(workbook, `Reporte_Allanamientos_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Encabezado */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 gap-4">
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => router.push('/allanamientos')}
              className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Filter className="w-5 h-5 text-blue-500" /> Consultas y Reportes Operativos
              </h1>
              <p className="text-xs text-slate-400">Consulta directa de registros y exportación a Excel.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={exportarExcel}
              disabled={registros.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-950/20"
            >
              <Download className="w-4 h-4" /> Exportar ({registros.length})
            </button>
          </div>
        </div>

        {/* Panel de Filtros */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4 backdrop-blur-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">

            {/* Período Rápido */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Período de Análisis</label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => aplicarPresetFecha('semana')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                    periodoActivo === 'semana'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Esta Semana
                </button>
                <button
                  type="button"
                  onClick={() => aplicarPresetFecha('mes')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                    periodoActivo === 'mes'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30'
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
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">Todos los Partidos</option>
                {partidosList.map((p, idx) => (
                  <option key={idx} value={p}>{p}</option>
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
                  className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white [color-scheme:dark]"
                />
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => { setFechaHasta(e.target.value); setPeriodoActivo('') }}
                  className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white [color-scheme:dark]"
                />
              </div>
            </div>

          </div>

          {/* Chips de Resultados */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-slate-400 mr-1">Filtrar por resultado:</span>

              <button
                type="button"
                onClick={() => setSoloArmas(!soloArmas)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 cursor-pointer ${
                  soloArmas 
                    ? 'bg-red-950/80 border-red-800 text-red-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-red-400" /> Con Armas
              </button>

              <button
                type="button"
                onClick={() => setSoloVehiculos(!soloVehiculos)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 cursor-pointer ${
                  soloVehiculos 
                    ? 'bg-sky-950/80 border-sky-800 text-sky-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Car className="w-3.5 h-3.5 text-sky-400" /> Con Vehículos
              </button>

              <button
                type="button"
                onClick={() => setSoloDetenidosAprehendidos(!soloDetenidosAprehendidos)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 cursor-pointer ${
                  soloDetenidosAprehendidos 
                    ? 'bg-purple-950/80 border-purple-800 text-purple-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-purple-400" /> Con Personas
              </button>

              <button
                type="button"
                onClick={() => setSoloPositivos(!soloPositivos)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 cursor-pointer ${
                  soloPositivos 
                    ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Solo Positivos
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={resetearFiltros}
                className="px-3 py-2 bg-slate-950 text-slate-400 hover:text-white border border-slate-800 rounded-xl text-xs transition flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Limpiar
              </button>
              <button
                onClick={() => ejecutarBusqueda()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-950/30"
              >
                <Filter className="w-3.5 h-3.5" /> Aplicar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Tabla de Resultados */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/90 uppercase text-[10px] text-slate-400 border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Ubicación / Fecha</th>
                  <th className="py-3 px-4">Personas</th>
                  <th className="py-3 px-4">Armas</th>
                  <th className="py-3 px-4">Vehículos</th>
                  <th className="py-3 px-4 text-center">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <div className="flex justify-center items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                        <span>Cargando registros...</span>
                      </div>
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Sin registros para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  registros.map((item) => {
                    const v = obtenerValores(item)

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{item.partido || 'S/D'}</div>
                          <div className="text-[10px] text-slate-400">{item.fecha_ejecucion}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="bg-slate-950 border border-slate-800/80 px-2.5 py-1 rounded-lg text-xs font-medium">
                            Total: <strong className="text-purple-400">{v.totalPersonas}</strong>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="bg-slate-950 border border-slate-800/80 px-2.5 py-1 rounded-lg text-xs font-medium">
                            Total: <strong className="text-red-400">{v.totalArmas}</strong>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="bg-slate-950 border border-slate-800/80 px-2.5 py-1 rounded-lg text-xs font-medium">
                            Total: <strong className="text-sky-400">{v.totalVehiculos}</strong>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            String(item.resultado_medida).toLowerCase().includes('posi') 
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' 
                              : 'bg-red-950/80 text-red-400 border border-red-800'
                          }`}>
                            {item.resultado_medida || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
