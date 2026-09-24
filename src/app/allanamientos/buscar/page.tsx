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
    <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-[#26364d] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.push('/allanamientos')}
              className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#26364d] bg-[#071426] text-slate-400 transition hover:border-[#806c3f] hover:text-white"
              aria-label="Volver a Allanamientos"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="cop-kicker">Archivo operativo · OP-02</p>
              <h1 className="mt-1 text-xl font-extrabold uppercase tracking-[0.035em] text-white sm:text-2xl">Consultas y reportes</h1>
              <p className="mt-1 text-xs text-slate-400">Consulta histórica paginada y exportación completa de registros.</p>
            </div>
          </div>

          {puedeExportar && (
            <button
              onClick={exportarExcel}
              disabled={totalRegistros === 0 || exportando}
              className="cop-action-secondary w-full border-[#806c3f]! text-[#d5bd82]! disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exportando ? 'Generando archivo...' : `Exportar Excel · ${totalRegistros}`}
            </button>
          )}
        </header>

        <section className="border border-[#26364d] bg-[#071426]/80">
          <div className="flex items-center gap-3 border-b border-[#26364d] bg-[#050e1c] px-4 py-3 sm:px-5">
            <span className="cop-form-section-index">01</span>
            <div>
              <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-white">Criterios de consulta</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">Definí el período, la jurisdicción y el contenido requerido.</p>
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <CampoConsulta etiqueta="Período de análisis">
                <div className="grid grid-cols-2 border border-[#26364d] bg-[#050e1c]">
                  <BotonPeriodo activo={periodoActivo === 'semana'} onClick={() => aplicarPresetFecha('semana')}>Semana rendida</BotonPeriodo>
                  <BotonPeriodo activo={periodoActivo === 'mes'} onClick={() => aplicarPresetFecha('mes')}>Mes actual</BotonPeriodo>
                </div>
              </CampoConsulta>

              <CampoConsulta etiqueta="Partido">
                <select value={partidoSel} onChange={(e) => setPartidoSel(e.target.value)} className="h-10 w-full border border-[#26364d] bg-[#050e1c] px-3 text-xs text-white outline-none transition focus:border-[#c4a35a]">
                  <option value="">Todos los partidos</option>
                  {partidosList.map((partido) => <option key={partido} value={partido}>{partido}</option>)}
                </select>
              </CampoConsulta>

              <CampoConsulta etiqueta="Superintendencia">
                <select value={superintendenciaSel} onChange={(e) => setSuperintendenciaSel(e.target.value)} className="h-10 w-full border border-[#26364d] bg-[#050e1c] px-3 text-xs text-white outline-none transition focus:border-[#c4a35a]">
                  <option value="">Todas las superintendencias</option>
                  {superintendenciasList.map((superintendencia) => <option key={superintendencia.id} value={superintendencia.id}>{superintendencia.nombre}</option>)}
                </select>
              </CampoConsulta>

              <CampoConsulta etiqueta="Fecha desde / hasta">
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" aria-label="Fecha desde" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPeriodoActivo('') }} className="h-10 min-w-0 w-full border border-[#26364d] bg-[#050e1c] px-2 text-[11px] text-white outline-none [color-scheme:dark] focus:border-[#c4a35a]" />
                  <input type="date" aria-label="Fecha hasta" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPeriodoActivo('') }} className="h-10 min-w-0 w-full border border-[#26364d] bg-[#050e1c] px-2 text-[11px] text-white outline-none [color-scheme:dark] focus:border-[#c4a35a]" />
                </div>
              </CampoConsulta>
            </div>

            <div className="flex flex-col gap-4 border-t border-[#17263a] pt-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Contenido del procedimiento</p>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Chip activo={soloArmas} onClick={() => setSoloArmas(!soloArmas)} icon={<ShieldAlert className="h-3.5 w-3.5" />}>Con armas</Chip>
                  <Chip activo={soloVehiculos} onClick={() => setSoloVehiculos(!soloVehiculos)} icon={<Car className="h-3.5 w-3.5" />}>Con vehículos</Chip>
                  <Chip activo={soloDetenidosAprehendidos} onClick={() => setSoloDetenidosAprehendidos(!soloDetenidosAprehendidos)} icon={<Users className="h-3.5 w-3.5" />}>Con personas</Chip>
                  <Chip activo={soloPositivos} onClick={() => setSoloPositivos(!soloPositivos)} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Solo positivos</Chip>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button onClick={resetearFiltros} className="cop-action-secondary">
                  <RefreshCw className="h-3.5 w-3.5" /> Restablecer
                </button>
                <button onClick={() => void ejecutarBusqueda(1)} disabled={loading} className="cop-action-primary disabled:opacity-50">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Filter className="h-3.5 w-3.5" />} Aplicar filtros
                </button>
              </div>
            </div>
          </div>
        </section>

        {mensajeError && <div className="border border-red-800 bg-red-950/30 px-4 py-3 text-xs text-red-300">{mensajeError}</div>}

        <section className="overflow-hidden border border-[#26364d] bg-[#071426]/80">
          <div className="flex items-center justify-between gap-3 border-b border-[#26364d] bg-[#050e1c] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="cop-form-section-index">02</span>
              <div>
                <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-white">Resultado de la consulta</h2>
                <p className="mt-0.5 text-[10px] text-slate-500">{totalRegistros} registros encontrados</p>
              </div>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-xs text-slate-300">
              <thead className="border-b border-[#26364d] bg-[#071426] text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">IPP / ubicación / fecha</th>
                  <th className="px-4 py-3">Superintendencia</th>
                  <th className="px-4 py-3 text-center">Personas</th>
                  <th className="px-4 py-3 text-center">Armas</th>
                  <th className="px-4 py-3 text-center">Vehículos</th>
                  <th className="px-4 py-3 text-right">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17263a]">
                {loading ? (
                  <tr><td colSpan={6} className="py-14 text-center text-slate-400"><span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin text-[#c4a35a]" /> Consultando registros...</span></td></tr>
                ) : registros.length === 0 ? (
                  <tr><td colSpan={6} className="py-14 text-center text-slate-500">Sin registros para los criterios seleccionados.</td></tr>
                ) : registros.map((item) => {
                  const valores = obtenerValoresSecuestros(item)
                  return (
                    <tr key={item.id} className="transition hover:bg-white/[0.018]">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-white">{item.numero_ipp || 'S/D'} · {item.partido || 'S/D'}</div>
                        <div className="mt-1 font-mono text-[10px] text-slate-500">{item.fecha_ejecucion}</div>
                      </td>
                      <td className="max-w-sm px-4 py-4"><span className="whitespace-normal break-words text-[11px] leading-relaxed">{item.superintendencias?.nombre || 'S/D'}</span></td>
                      <Total valor={valores.totalPersonas} />
                      <Total valor={valores.totalArmas} />
                      <Total valor={valores.totalVehiculos} />
                      <td className="px-4 py-4 text-right"><EstadoResultado valor={item.resultado_medida} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#17263a] md:hidden">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-xs text-slate-400"><Loader2 className="h-5 w-5 animate-spin text-[#c4a35a]" /> Consultando registros...</div>
            ) : registros.length === 0 ? (
              <div className="py-14 text-center text-xs text-slate-500">Sin registros para los criterios seleccionados.</div>
            ) : registros.map((item) => {
              const valores = obtenerValoresSecuestros(item)
              return (
                <article key={item.id} className="border-l-2 border-l-[#806c3f] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#c4a35a]">IPP {item.numero_ipp || 'S/D'}</p>
                      <h3 className="mt-1 text-sm font-bold text-white">{item.partido || 'S/D'}</h3>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">{item.fecha_ejecucion}</p>
                    </div>
                    <EstadoResultado valor={item.resultado_medida} />
                  </div>
                  <p className="mt-3 border-t border-[#17263a] pt-3 text-[10px] leading-relaxed text-slate-400">{item.superintendencias?.nombre || 'S/D'}</p>
                  <div className="mt-3 grid grid-cols-3 divide-x divide-[#26364d] border border-[#26364d] bg-[#050e1c]">
                    <TotalMovil etiqueta="Personas" valor={valores.totalPersonas} />
                    <TotalMovil etiqueta="Armas" valor={valores.totalArmas} />
                    <TotalMovil etiqueta="Vehículos" valor={valores.totalVehiculos} />
                  </div>
                </article>
              )
            })}
          </div>

          {!loading && totalRegistros > 0 && (
            <div className="flex flex-col gap-3 border-t border-[#26364d] bg-[#050e1c] px-4 py-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span><strong className="text-white">{indiceInicial + 1}</strong>–<strong className="text-white">{Math.min(indiceInicial + registros.length, totalRegistros)}</strong> de <strong className="text-white">{totalRegistros}</strong></span>
                <select value={registrosPorPagina} onChange={(e) => { const cantidad = Number(e.target.value); setRegistrosPorPagina(cantidad); void ejecutarBusqueda(1, cantidad, filtrosAplicados) }} className="border border-[#26364d] bg-[#071426] px-2 py-1 text-[10px] text-slate-300 outline-none focus:border-[#c4a35a]">
                  <option value={25}>25 por página</option><option value={50}>50 por página</option><option value={100}>100 por página</option>
                </select>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <button onClick={() => void ejecutarBusqueda(paginaActual - 1)} disabled={paginaActual === 1} className="border border-[#26364d] bg-[#071426] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-30">Anterior</button>
                <span className="px-1 text-center text-[10px]">Página {paginaActual} de {totalPaginas}</span>
                <button onClick={() => void ejecutarBusqueda(paginaActual + 1)} disabled={paginaActual >= totalPaginas} className="border border-[#26364d] bg-[#071426] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-30">Siguiente</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function CampoConsulta({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return <div><label className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.09em] text-slate-500">{etiqueta}</label>{children}</div>
}

function BotonPeriodo({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`h-[38px] border-l-2 px-2 text-[10px] font-extrabold uppercase tracking-[0.04em] transition first:border-r first:border-r-[#26364d] ${activo ? 'border-l-[#c4a35a] bg-[#0e1d31] text-white' : 'border-l-transparent text-slate-500 hover:text-slate-300'}`}>{children}</button>
}

function Chip({ activo, onClick, icon, children }: { activo: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={activo} className={`flex min-h-9 items-center justify-center gap-1.5 border px-3 text-[10px] font-bold uppercase tracking-[0.035em] transition ${activo ? 'border-[#806c3f] bg-[#0e1d31] text-[#d5bd82]' : 'border-[#26364d] bg-[#050e1c] text-slate-500 hover:text-slate-300'}`}>{icon}{children}</button>
}

function EstadoResultado({ valor }: { valor: unknown }) {
  const positivo = String(valor).toLowerCase().includes('posi')
  return <span className={`inline-flex border-l-2 px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.06em] ${positivo ? 'border-emerald-500 text-emerald-400' : 'border-red-500 text-red-400'}`}>{String(valor || 'N/A')}</span>
}

function Total({ valor }: { valor: number }) {
  return <td className="px-4 py-4 text-center"><strong className="font-mono text-sm text-white">{valor}</strong></td>
}

function TotalMovil({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return <div className="px-2 py-2.5 text-center"><p className="text-[8px] font-extrabold uppercase tracking-[0.06em] text-slate-600">{etiqueta}</p><p className="mt-1 font-mono text-sm font-bold text-white">{valor}</p></div>
}
