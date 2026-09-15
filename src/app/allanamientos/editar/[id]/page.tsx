'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Plus, Trash2, Save, ShieldAlert, Loader2 } from 'lucide-react'

export default function EditarAllanamientoPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const id = resolvedParams.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Listas maestras
  const [partidosList, setPartidosList] = useState<string[]>([])
  const [especialidadesList, setEspecialidadesList] = useState<string[]>([])

  // Horario en formato 24hs
  const [horaEjecucion, setHoraEjecucion] = useState('12')
  const [minutoEjecucion, setMinutoEjecucion] = useState('00')

  // Estado del formulario
  const [formData, setFormData] = useState({
    superintendencia_id: '',
    numero_ipp: '',
    caratula: '',
    ufi_juzgado: '',
    fecha_solicitud: '',
    partido: '',
    departamental: '',
    dependencia: '',
    fecha_ejecucion: '',
    personal_propio: 1,
    resultado_medida: 'Positivo',
    objetivos: 1,
    resultado_secuestros: 'Negativo',
    numero_parte_urgente: '',
    orden_servicio_propia: '',
    orden_servicio_cop: '',
    observaciones: ''
  })

  // Colaboraciones
  const [colaboraciones, setColaboraciones] = useState<any[]>([])

  // Secuestros detallados
  const [armas, setArmas] = useState<{ subtipo: string; cantidad: number }[]>([])
  const [vehiculos, setVehiculos] = useState<{ subtipo: string; cantidad: number }[]>([])
  const [detenidos, setDetenidos] = useState<{ subtipo: string; cantidad: number }[]>([])

  useEffect(() => {
    async function init() {
      if (!id) return
      await fetchMaestras()
      await fetchAllanamiento()
    }
    init()
  }, [id])

  async function fetchMaestras() {
    try {
      const { data: partData } = await supabase.from('partidos').select('nombre').order('nombre')
      if (partData) setPartidosList(partData.map(p => p.nombre))

      const { data: espData } = await supabase.from('especialidades').select('nombre').order('nombre')
      if (espData) setEspecialidadesList(espData.map(e => e.nombre))
    } catch (err) {
      console.error('Error cargando tablas maestras:', err)
    }
  }

  async function fetchAllanamiento() {
    try {
      setLoading(true)
      const { data, error: fetchErr } = await supabase
        .from('allanamientos')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchErr) {
        console.error('Error Supabase fetch:', fetchErr)
        throw new Error(fetchErr.message || 'No se pudo encontrar el registro solicitado.')
      }

      if (!data) throw new Error('No se encontró el registro solicitado.')

      // Cargar hora de ejecución
      if (data.horario_ejecucion) {
        const [h, m] = data.horario_ejecucion.split(':')
        if (h) setHoraEjecucion(h.padStart(2, '0'))
        if (m) setMinutoEjecucion(m.padStart(2, '0'))
      }

      // Parsear observaciones y secuestros guardados previamente
      let obsLimpia = data.observaciones || ''

      if (obsLimpia.includes('Secuestros:')) {
        const [obsPart, secuestraPart] = obsLimpia.split(' - Secuestros:')
        obsLimpia = obsPart.trim()

        if (secuestraPart) {
          const matchArmas = secuestraPart.match(/Armas\s*\[(.*?)\]/)
          if (matchArmas && matchArmas[1]) {
            const items = matchArmas[1].split(',').map((item: string) => {
              const [subtipo, cant] = item.split(':').map((s: string) => s.trim())
              return { subtipo, cantidad: parseInt(cant) || 1 }
            })
            setArmas(items)
          }

          const matchVeh = secuestraPart.match(/Vehículos\s*\[(.*?)\]/)
          if (matchVeh && matchVeh[1]) {
            const items = matchVeh[1].split(',').map((item: string) => {
              const [subtipo, cant] = item.split(':').map((s: string) => s.trim())
              return { subtipo, cantidad: parseInt(cant) || 1 }
            })
            setVehiculos(items)
          }

          const matchDet = secuestraPart.match(/Personas\s*\[(.*?)\]/)
          if (matchDet && matchDet[1]) {
            const items = matchDet[1].split(',').map((item: string) => {
              const [subtipo, cant] = item.split(':').map((s: string) => s.trim())
              return { subtipo, cantidad: parseInt(cant) || 1 }
            })
            setDetenidos(items)
          }
        }
      }

      setFormData({
        superintendencia_id: data.superintendencia_id || '',
        numero_ipp: data.numero_ipp || '',
        caratula: data.caratula || '',
        ufi_juzgado: data.ufi_juzgado || '',
        fecha_solicitud: data.fecha_solicitud || '',
        partido: data.partido || '',
        departamental: data.departamental || '',
        dependencia: data.dependencia || '',
        fecha_ejecucion: data.fecha_ejecucion || '',
        personal_propio: data.personal_propio ?? 1,
        resultado_medida: data.resultado_medida || 'Positivo',
        objetivos: data.objetivos ?? 1,
        resultado_secuestros: data.resultado_secuestros || 'Negativo',
        numero_parte_urgente: data.numero_parte_urgente || '',
        orden_servicio_propia: data.orden_servicio_propia || '',
        orden_servicio_cop: data.orden_servicio_cop || '',
        observaciones: obsLimpia
      })

      const { data: colabData } = await supabase
        .from('allanamiento_colaboraciones')
        .select('*')
        .eq('allanamiento_id', id)

      if (colabData && colabData.length > 0) {
        setColaboraciones(colabData.map(c => ({
          especialidad: c.especialidad,
          cant_solicitada: c.cant_solicitada,
          cant_afectada: c.cant_afectada
        })))
      } else {
        setColaboraciones([{ especialidad: '', cant_solicitada: 1, cant_afectada: 1 }])
      }

    } catch (err: any) {
      setError(err.message || 'Error al obtener los datos.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const addColaboracion = () => setColaboraciones(prev => [...prev, { especialidad: '', cant_solicitada: 1, cant_afectada: 1 }])
  const removeColaboracion = (index: number) => setColaboraciones(prev => prev.filter((_, i) => i !== index))
  const handleColabChange = (index: number, field: string, value: any) => {
    const updated = [...colaboraciones]
    updated[index] = { ...updated[index], [field]: value }
    setColaboraciones(updated)
  }

  const addItem = (list: any[], setList: Function, template: object) => setList([...list, template])
  const removeItem = (index: number, list: any[], setList: Function) => setList(list.filter((_, i) => i !== index))
  const handleItemChange = (index: number, field: string, value: any, list: any[], setList: Function) => {
    const updated = [...list]
    updated[index] = { ...updated[index], [field]: value }
    setList(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const horarioFinal = `${horaEjecucion}:${minutoEjecucion}`

      let detalleSecuestrosTexto = ''
      let totalArmas = 0
      let totalVehiculos = 0
      let totalDetenidos = 0

      if (formData.resultado_secuestros === 'Positivo') {
        totalArmas = armas.reduce((acc, a) => acc + (Number(a.cantidad) || 0), 0)
        totalVehiculos = vehiculos.reduce((acc, v) => acc + (Number(v.cantidad) || 0), 0)
        totalDetenidos = detenidos.reduce((acc, d) => acc + (Number(d.cantidad) || 0), 0)

        const resumenArmas = armas.filter(a => a.cantidad > 0).map(a => `${a.subtipo}: ${a.cantidad}`).join(', ')
        const resumenVehiculos = vehiculos.filter(v => v.cantidad > 0).map(v => `${v.subtipo}: ${v.cantidad}`).join(', ')
        const resumenDetenidos = detenidos.filter(d => d.cantidad > 0).map(d => `${d.subtipo}: ${d.cantidad}`).join(', ')
        
        detalleSecuestrosTexto = [
          resumenArmas ? `Armas [${resumenArmas}]` : '',
          resumenVehiculos ? `Vehículos [${resumenVehiculos}]` : '',
          resumenDetenidos ? `Personas [${resumenDetenidos}]` : ''
        ].filter(Boolean).join(' | ')
      }

      const obsBase = formData.observaciones.split(' - Secuestros:')[0].trim()

      const obsFinales = [obsBase, detalleSecuestrosTexto ? `Secuestros: ${detalleSecuestrosTexto}` : '']
        .filter(Boolean)
        .join(' - ')

      const payloadAllanamiento = {
        numero_ipp: formData.numero_ipp,
        caratula: formData.caratula,
        ufi_juzgado: formData.ufi_juzgado || 'Sin especificar',
        fecha_solicitud: formData.fecha_solicitud || null,
        fecha_ejecucion: formData.fecha_ejecucion,
        horario_ejecucion: horarioFinal,
        partido: formData.partido,
        lugar_presentacion: formData.dependencia || formData.partido,
        departamental: formData.departamental || null,
        dependencia: formData.dependencia || 'Sin especificar',
        objetivos: Number(formData.objetivos) || 1,
        personal_propio: Number(formData.personal_propio) || 0,
        resultado_medida: formData.resultado_medida,
        es_positivo: formData.resultado_medida === 'Positivo',
        resultado_secuestros: formData.resultado_secuestros,
        armas_secuestradas: totalArmas,
        vehiculos_secuestrados: totalVehiculos,
        detenidos_aprehendidos: totalDetenidos,
        orden_servicio_propia: formData.orden_servicio_propia || 'S/N',
        orden_servicio_cop: formData.orden_servicio_cop || null,
        numero_parte_urgente: formData.numero_parte_urgente || null,
        observaciones: obsFinales || null
      }

      const { error: updateErr } = await supabase
        .from('allanamientos')
        .update(payloadAllanamiento)
        .eq('id', id)

      if (updateErr) throw updateErr

      await supabase.from('allanamiento_colaboraciones').delete().eq('allanamiento_id', id)

      if (colaboraciones.length > 0 && colaboraciones[0].especialidad) {
        const colabToInsert = colaboraciones.map(c => ({
          allanamiento_id: id,
          especialidad: c.especialidad,
          cant_solicitada: Number(c.cant_solicitada) || 0,
          cant_afectada: Number(c.cant_afectada) || 0
        }))
        const { error: colabError } = await supabase.from('allanamiento_colaboraciones').insert(colabToInsert)
        if (colabError) throw colabError
      }

      // Forzar revalidación de caché en Next.js antes de redirigir
      router.refresh()
      router.push('/dashboard')

    } catch (err: any) {
      console.error('Error al actualizar:', err)
      setError(err.message || 'Ocurrió un error al actualizar el registro.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="text-sm font-medium text-slate-400">Cargando datos del allanamiento...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center space-x-4">
            <button 
              type="button"
              onClick={() => router.back()}
              className="p-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <ShieldAlert className="w-6 h-6 text-amber-500" /> Editar Allanamiento
              </h1>
              <p className="text-sm text-slate-400">Modifique la información cargada para la causa IPP: {formData.numero_ipp}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-200 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* TARJETA 1 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <h2 className="text-base font-semibold text-blue-400 mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
              ⚖️ 1. Datos Judiciales y de Causa
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Número IPP *</label>
                <input 
                  type="text" 
                  name="numero_ipp" 
                  required 
                  value={formData.numero_ipp} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Carátula *</label>
                <input 
                  type="text" 
                  name="caratula" 
                  required 
                  value={formData.caratula} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">UFI / Juzgado</label>
                <input 
                  type="text" 
                  name="ufi_juzgado" 
                  value={formData.ufi_juzgado} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Fecha de Solicitud</label>
                <input 
                  type="date" 
                  name="fecha_solicitud" 
                  value={formData.fecha_solicitud} 
                  onChange={handleChange}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onKeyDown={(e) => e.preventDefault()}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Número P.U.</label>
                <input 
                  type="text" 
                  name="numero_parte_urgente" 
                  value={formData.numero_parte_urgente} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nro. Orden Serv. Propia</label>
                <input 
                  type="text" 
                  name="orden_servicio_propia" 
                  value={formData.orden_servicio_propia} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-xs font-medium text-slate-400 mb-1">Nro. Orden Serv. C.O.P.</label>
                <input 
                  type="text" 
                  name="orden_servicio_cop" 
                  value={formData.orden_servicio_cop} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* TARJETA 2 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <h2 className="text-base font-semibold text-blue-400 mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
              📍 2. Ubicación y Jurisdicción
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Partido *</label>
                <select 
                  name="partido" 
                  required 
                  value={formData.partido} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">Seleccione partido...</option>
                  {partidosList.map((p, idx) => (
                    <option key={idx} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Departamental</label>
                <input 
                  type="text" 
                  name="departamental" 
                  value={formData.departamental} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Dependencia Interviniente</label>
                <input 
                  type="text" 
                  name="dependencia" 
                  value={formData.dependencia} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Fecha de Ejecución *</label>
                <input 
                  type="date" 
                  name="fecha_ejecucion" 
                  required 
                  value={formData.fecha_ejecucion} 
                  onChange={handleChange}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onKeyDown={(e) => e.preventDefault()}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Horario de Ejecución (24hs) *</label>
                <div className="flex items-center gap-2">
                  <select
                    value={horaEjecucion}
                    onChange={(e) => setHoraEjecucion(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer text-center"
                  >
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                      <option key={h} value={h} className="bg-slate-900 text-white">
                        {h} hs
                      </option>
                    ))}
                  </select>
                  <span className="text-white font-bold">:</span>
                  <select
                    value={minutoEjecucion}
                    onChange={(e) => setMinutoEjecucion(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer text-center"
                  >
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                      <option key={m} value={m} className="bg-slate-900 text-white">
                        {m} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* TARJETA 3 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <h2 className="text-base font-semibold text-blue-400 mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
              👥 3. Personal y Resultados Principales
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Personal Propio</label>
                <select 
                  name="personal_propio" 
                  value={formData.personal_propio} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {Array.from({ length: 100 }, (_, i) => (
                    <option key={i} value={i} className="bg-slate-900 text-white">
                      {i}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Resultado de la Medida *</label>
                <select 
                  name="resultado_medida" 
                  value={formData.resultado_medida} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="Positivo">Positivo</option>
                  <option value="Negativo">Negativo</option>
                  <option value="Suspendido">Suspendido</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Cantidad de Objetivos</label>
                <select 
                  name="objetivos" 
                  value={formData.objetivos} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {Array.from({ length: 100 }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={num} className="bg-slate-900 text-white">
                      {num}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* TARJETA 4 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
              <h2 className="text-base font-semibold text-blue-400 flex items-center gap-2">
                🤝 4. Personal en Colaboración
              </h2>
              <button 
                type="button" 
                onClick={addColaboracion}
                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-xl text-xs font-medium flex items-center gap-1.5 transition border border-blue-500/30"
              >
                <Plus className="w-4 h-4" /> Agregar otra especialidad
              </button>
            </div>

            <div className="space-y-3">
              {colaboraciones.map((colab, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                  <div className="md:col-span-6">
                    <label className="block text-[10px] text-slate-400 mb-1">Especialidad</label>
                    <select 
                      value={colab.especialidad}
                      onChange={(e) => handleColabChange(index, 'especialidad', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white cursor-pointer"
                    >
                      <option value="">Seleccione especialidad...</option>
                      {especialidadesList.map((esp, i) => (
                        <option key={i} value={esp}>{esp}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] text-slate-400 mb-1">Solicitado</label>
                    <select 
                      value={colab.cant_solicitada}
                      onChange={(e) => handleColabChange(index, 'cant_solicitada', parseInt(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white text-center cursor-pointer"
                    >
                      {Array.from({ length: 100 }, (_, i) => (
                        <option key={i} value={i} className="bg-slate-900 text-white">{i}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] text-slate-400 mb-1">Afectado</label>
                    <select 
                      value={colab.cant_afectada}
                      onChange={(e) => handleColabChange(index, 'cant_afectada', parseInt(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white text-center cursor-pointer"
                    >
                      {Array.from({ length: 100 }, (_, i) => (
                        <option key={i} value={i} className="bg-slate-900 text-white">{i}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-1 flex justify-end items-end h-full pt-4">
                    {colaboraciones.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => removeColaboracion(index)}
                        className="p-2 text-red-400 hover:bg-red-950/30 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TARJETA 5 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
            <h2 className="text-base font-semibold text-blue-400 border-b border-slate-800 pb-2 flex items-center gap-2">
              📦 5. Secuestros y Observaciones
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Resultado de Secuestros *</label>
                <select 
                  name="resultado_secuestros" 
                  value={formData.resultado_secuestros} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="Negativo">Negativo</option>
                  <option value="Positivo">Positivo</option>
                </select>
              </div>
            </div>

            {formData.resultado_secuestros === 'Positivo' && (
              <div className="space-y-6 pt-4 border-t border-slate-800">
                {/* Armas */}
                <div className="space-y-2 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-300">Armas Secuestradas</span>
                    <button 
                      type="button" 
                      onClick={() => addItem(armas, setArmas, { subtipo: 'Arma Corta', cantidad: 1 })}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Cargar Arma
                    </button>
                  </div>
                  {armas.map((arma, idx) => (
                    <div key={idx} className="flex gap-3 items-center">
                      <select 
                        value={arma.subtipo}
                        onChange={(e) => handleItemChange(idx, 'subtipo', e.target.value, armas, setArmas)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer"
                      >
                        <option value="Arma Corta">Arma Corta</option>
                        <option value="Arma Larga">Arma Larga</option>
                        <option value="Arma Blanca">Arma Blanca</option>
                        <option value="Réplica">Réplica</option>
                      </select>
                      <select 
                        value={arma.cantidad}
                        onChange={(e) => handleItemChange(idx, 'cantidad', parseInt(e.target.value), armas, setArmas)}
                        className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white text-center cursor-pointer"
                      >
                        {Array.from({ length: 100 }, (_, i) => (
                          <option key={i} value={i} className="bg-slate-900 text-white">{i}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeItem(idx, armas, setArmas)} className="text-red-400 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Vehículos */}
                <div className="space-y-2 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-300">Vehículos Secuestrados</span>
                    <button 
                      type="button" 
                      onClick={() => addItem(vehiculos, setVehiculos, { subtipo: 'Auto', cantidad: 1 })}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Cargar Vehículo
                    </button>
                  </div>
                  {vehiculos.map((veh, idx) => (
                    <div key={idx} className="flex gap-3 items-center">
                      <select 
                        value={veh.subtipo}
                        onChange={(e) => handleItemChange(idx, 'subtipo', e.target.value, vehiculos, setVehiculos)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer"
                      >
                        <option value="Auto">Auto</option>
                        <option value="Moto">Moto</option>
                        <option value="Camioneta">Camioneta</option>
                        <option value="Otros">Otros</option>
                      </select>
                      <select 
                        value={veh.cantidad}
                        onChange={(e) => handleItemChange(idx, 'cantidad', parseInt(e.target.value), vehiculos, setVehiculos)}
                        className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white text-center cursor-pointer"
                      >
                        {Array.from({ length: 100 }, (_, i) => (
                          <option key={i} value={i} className="bg-slate-900 text-white">{i}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeItem(idx, vehiculos, setVehiculos)} className="text-red-400 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Detenidos */}
                <div className="space-y-2 bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-300">Detenidos y Aprehendidos</span>
                    <button 
                      type="button" 
                      onClick={() => addItem(detenidos, setDetenidos, { subtipo: 'Detenido', cantidad: 1 })}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Cargar Persona
                    </button>
                  </div>
                  {detenidos.map((det, idx) => (
                    <div key={idx} className="flex gap-3 items-center">
                      <select 
                        value={det.subtipo}
                        onChange={(e) => handleItemChange(idx, 'subtipo', e.target.value, detenidos, setDetenidos)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer"
                      >
                        <option value="Detenido">Detenido</option>
                        <option value="Aprehendido">Aprehendido</option>
                      </select>
                      <select 
                        value={det.cantidad}
                        onChange={(e) => handleItemChange(idx, 'cantidad', parseInt(e.target.value), detenidos, setDetenidos)}
                        className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white text-center cursor-pointer"
                      >
                        {Array.from({ length: 100 }, (_, i) => (
                          <option key={i} value={i} className="bg-slate-900 text-white">{i}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeItem(idx, detenidos, setDetenidos)} className="text-red-400 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Observaciones</label>
              <textarea 
                name="observaciones" 
                rows={3}
                value={formData.observaciones} 
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4">
            <button 
              type="button" 
              onClick={() => router.back()}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-medium transition border border-slate-800"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-amber-600/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Actualizando...' : 'Actualizar Allanamiento'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}