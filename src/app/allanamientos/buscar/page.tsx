'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
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
  const [superintendenciasList, setSuperintendenciasList] = useState<{ id: string; nombre: string }[]>([])
  const [especialidadesList, setEspecialidadesList] = useState<string[]>([])

  // Estado de Filtros Principales
  const [partidoSel, setPartidoSel] = useState('')
  const [superintendenciaSel, setSuperintendenciaSel] = useState('')
  const [especialidadSel, setEspecialidadSel] = useState('')
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

      const { data: supData } = await supabase.from('superintendencias').select('id, nombre').order('nombre')
      if (supData) setSuperintendenciasList(supData || [])

      const { data: espData } = await supabase.from('especialidades').select('nombre').order('nombre')
      if (espData) setEspecialidadesList(espData.map(e => e.nombre))
    } catch (e) {
      console.error("Error al cargar listas maestras:", e)
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
    setSuperintendenciaSel('')
    setEspecialidadSel('')
    setSoloArmas(false)
    setSoloVehiculos(false)
    setSoloDetenidosAprehendidos(false)
    setSoloPositivos(false)
    setFechaDesde('')
    setFechaHasta('')
    setPeriodoActivo('')
    ejecutarBusqueda({ desde: '', hasta: '', partido: '', sup: '', esp: '' })
  }

  // Funciones auxiliares para procesar desgloses de secuestros
  const extraerSecuestros = (item: any) => {
    const secuestros = item.allanamiento_secuestros || []
    
    const res = {
      corta: 0, larga: 0, blanca: 0, replica: 0,
      autos: 0, motos: 0, camionetas: 0, otros: 0,
      detenidos: 0, aprehendidos: 0
    }

    secuestros.forEach((s: any) => {
      const tipo = String(s.tipo || '').toLowerCase()
      const subtipo = String(s.subtipo || '').toLowerCase()
      const cant = Number(s.cantidad) || 0

      if (tipo.includes('arma')) {
        if (subtipo.includes('corta')) res.corta += cant
        else if (subtipo.includes('larga')) res.larga += cant
        else if (subtipo.includes('blanca')) res.blanca += cant
        else if (subtipo.includes('replica') || subtipo.includes('réplica')) res.replica += cant
      } else if (tipo.includes('vehiculo') || tipo.includes('vehículo')) {
        if (subtipo.includes('auto')) res.autos += cant
        else if (subtipo.includes('moto')) res.motos += cant
        else if (subtipo.includes('camioneta')) res.camionetas += cant
        else res.otros += cant
      } else if (tipo.includes('persona') || tipo.includes('deten') || tipo.includes('aprehen')) {
        if (subtipo.includes('deteni')) res.detenidos += cant
        else if (subtipo.includes('aprehen')) res.aprehendidos += cant
      }
    })

    // Si la tabla principal ya tiene totales consolidados, los usa como fallback
    const totalArmas = (res.corta + res.larga + res.blanca + res.replica) || Number(item.armas_secuestradas) || 0
    const totalVehiculos = (res.autos + res.motos + res.camionetas + res.otros) || Number(item.vehiculos_secuestrados) || 0
    const totalPersonas = (res.detenidos + res.aprehendidos) || Number(item.detenidos_aprehendidos_count) || 0

    return { ...res, totalArmas, totalVehiculos, totalPersonas }
  }

  const obtenerEspecialidadesTexto = (item: any) => {
    if (item.especialidad_colaboradora) return item.especialidad_colaboradora
    const colabs = item.allanamiento_colaboraciones || []
    if (colabs.length > 0) {
      return colabs.map((c: any) => c.especialidad).filter(Boolean).join(', ')
    }
    return 'Sin especialidad'
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
          superintendencias!left(nombre),
          allanamiento_secuestros!left(*),
          allanamiento_colaboraciones!left(*)
        `)
        .order('fecha_ejecucion', { ascending: false })

      if (fDesde) query = query.gte('fecha_ejecucion', fDesde)
      if (fHasta) query = query.lte('fecha_ejecucion', fHasta)
      if (part) query = query.eq('partido', part)
      if (sup) query = query.eq('superintendencia_id', sup)
      if (esp) query = query.ilike('especialidad_colaboradora', `%${esp}%`)

      if (soloPositivos) query = query.ilike('resultado_medida', '%positivo%')

      const { data, error } = await query
      if (error) throw error

      let resultadosFiltrados = data || []

      // Filtrar por Chips de Resultados
      if (soloArmas) {
        resultadosFiltrados = resultadosFiltrados.filter(item => extraerSecuestros(item).totalArmas > 0)
      }

      if (soloVehiculos) {
        resultadosFiltrados = resultadosFiltrados.filter(item => extraerSecuestros(item).totalVehiculos > 0)
      }

      if (soloDetenidosAprehendidos) {
        resultadosFiltrados = resultadosFiltrados.filter(item => extraerSecuestros(item).totalPersonas > 0)
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
      const sec = extraerSecuestros(item)
      const espNombre = obtenerEspecialidadesTexto(item)

      return {
        'Superintendencia': item.superintendencias?.nombre || 'N/A',
        'Especialidad': espNombre,
        'Partido': item.partido || 'S/D',
        'Fecha Ejecución': item.fecha_ejecucion || 'S/D',
        'Resultado Medida': item.resultado_medida || 'N/A',
        'Detenidos': sec.detenidos,
        'Aprehendidos': sec.aprehendidos,
        'Armas Corta': sec.corta,
        'Armas Larga': sec.larga,
        'Armas Blanca': sec.blanca,
        'Réplicas': sec.replica,
        'Autos': sec.autos,
        'Motos': sec.motos,
        'Camionetas': sec.camionetas,
        'Otros Vehículos': sec.otros,
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
              <p className="text-xs text-slate-400">Filtrado gerencial por zonas, períodos y resultados de secuestros.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1.5 bg-blue-950/40 border border-blue-900/50 px-3 py-1.5 rounded-xl text-[11px] text-blue-300">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
              <span>Carga operativa: Lun 00:00 a Mié 08:00 hs</span>
            </div>

            <button
              onClick={exportarExcel}
              disabled={registros.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-950/20"
            >
              <Download className="w-4 h-4" /> Exportar ({registros.length})
            </button>
          </div>
        </div>

        {/* Panel de Filtros Principales */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4 backdrop-blur-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">

            {/* Rango Rápido */}
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

            {/* Superintendencia */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Superintendencia</label>
              <select
                value={superintendenciaSel}
                onChange={(e) => setSuperintendenciaSel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">Todas las Superintendencias</option>
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
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">Todas las Especialidades</option>
                {especialidadesList.map((nombre, idx) => (
                  <option key={idx} value={nombre}>{nombre}</option>
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

          {/* Filtros Rápidos de Resultados (Chips) */}
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
                <Users className="w-3.5 h-3.5 text-purple-400" /> Detenidos / Aprehendidos
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
                  <th className="py-3 px-4">Superintendencia / Esp.</th>
                  <th className="py-3 px-4">Personas APREH. / DET.</th>
                  <th className="py-3 px-4">Armas Secuestradas</th>
                  <th className="py-3 px-4">Vehículos Secuestrados</th>
                  <th className="py-3 px-4 text-center">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex justify-center items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                        <span>Procesando registros operativos...</span>
                      </div>
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Sin registros para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  registros.map((item) => {
                    const sec = extraerSecuestros(item)
                    const espNombre = obtenerEspecialidadesTexto(item)

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{item.partido || 'S/D'}</div>
                          <div className="text-[10px] text-slate-400">{item.fecha_ejecucion}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-slate-200">{item.superintendencias?.nombre || 'N/A'}</div>
                          <div className="text-[10px] text-slate-400">{espNombre}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex gap-2">
                            <span className="bg-slate-950 border border-slate-800/80 px-2 py-0.5 rounded-lg text-[11px]">
                              Det: <strong className="text-blue-400">{sec.detenidos}</strong>
                            </span>
                            <span className="bg-slate-950 border border-slate-800/80 px-2 py-0.5 rounded-lg text-[11px]">
                              Apreh: <strong className="text-emerald-400">{sec.aprehendidos}</strong>
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-[11px] text-slate-300 space-x-1">
                            <span>Corta: <strong>{sec.corta}</strong> |</span>
                            <span>Larga: <strong>{sec.larga}</strong> |</span>
                            <span>Blanca: <strong>{sec.blanca}</strong> |</span>
                            <span>Réplica: <strong>{sec.replica}</strong></span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-[11px] text-slate-300 space-x-1">
                            <span>Auto: <strong>{sec.autos}</strong> |</span>
                            <span>Moto: <strong>{sec.motos}</strong> |</span>
                            <span>Camioneta: <strong>{sec.camionetas}</strong></span>
                          </div>
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