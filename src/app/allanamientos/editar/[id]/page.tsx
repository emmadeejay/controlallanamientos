'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Plus, Trash2, Save, Loader2, Building2, Lock } from 'lucide-react'
import {
  esVentanaOperativaValida,
  obtenerRangoSemanaRendida,
  sanitizarDetalles,
  sumarDetalles,
  validarFechasAllanamiento,
} from '@/lib/allanamientos'
import { perfilTieneAcceso } from '@/lib/usuarios'
import { JURISDICCIONES_ARGENTINA } from '@/lib/jurisdicciones'

type ContextoEdicion = {
  usuarioId: string;
  elevado: boolean;
  superintendenciaId: string | null;
}

type RegistroEdicion = {
  operador_id: string | null;
  superintendencia_id: string | null;
  fecha_ejecucion: string | null;
}

export default function EditarAllanamientoPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const id = resolvedParams.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bloqueoEdicion, setBloqueoEdicion] = useState<string | null>(null)

  // Permisos y Roles
  const [esElevado, setEsElevado] = useState(false)

  // Listas maestras
  const [partidosList, setPartidosList] = useState<string[]>([])
  const [partidosError, setPartidosError] = useState(false)
  const [especialidadesList, setEspecialidadesList] = useState<string[]>([])
  const [especialidadesError, setEspecialidadesError] = useState(false)
  const [superintendenciasList, setSuperintendenciasList] = useState<{ id: string; nombre: string }[]>([])

  // Horario en formato 24hs
  const [horaEjecucion, setHoraEjecucion] = useState('')
  const [minutoEjecucion, setMinutoEjecucion] = useState('')
  const [enElActo, setEnElActo] = useState(false)

  // Estado del formulario
  const [formData, setFormData] = useState({
    superintendencia_id: '',
    numero_ipp: '',
    caratula: '',
    ufi_juzgado: '',
    fecha_solicitud: '',
    partido: '',
    es_exhorto: false,
    provincia: 'Buenos Aires',
    localidad: '',
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
    void inicializarEdicion()
  }, [id])

  async function inicializarEdicion() {
    if (!id) return
    setLoading(true)
    setBloqueoEdicion(null)
    setError(null)
    try {
      const contexto = await fetchPerfil()
      if (await fetchAllanamiento(contexto)) await fetchMaestras()
    } catch (err) {
      setBloqueoEdicion(err instanceof Error ? err.message : 'No fue posible verificar los permisos de edición. Reintentá la verificación.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchPerfil(): Promise<ContextoEdicion> {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('No fue posible verificar una sesión activa. Volvé a ingresar al sistema.')

    const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (profileError || !profile) throw new Error('No fue posible verificar tu perfil. Reintentá la verificación.')

    // Se conserva el criterio de roles elevados existente.
    const rawRole = profile.rol || profile.role || ''
    const rolNormalizado = String(rawRole).toLowerCase().trim()
    const elevado =
      rolNormalizado === 'supervisor' ||
      rolNormalizado === 'administrador' ||
      rolNormalizado === 'admin' ||
      rolNormalizado === 'superadmin' ||
      profile.role_id === 2 ||
      profile.role_id === 3

    if (!perfilTieneAcceso(profile)) throw new Error('Tu cuenta no está habilitada para editar allanamientos.')
    if (!elevado && (rolNormalizado !== 'operador' || !profile.modulos_permitidos?.includes('allanamientos'))) {
      throw new Error('Tu perfil no tiene permiso para editar en el módulo Allanamientos.')
    }

    setEsElevado(elevado)
    return { usuarioId: user.id, elevado, superintendenciaId: profile.superintendencia_id || null }
  }

  async function verificarEdicionOperador(contexto: ContextoEdicion, registro: RegistroEdicion) {
    if (contexto.elevado) return
    if (registro.operador_id !== contexto.usuarioId) {
      throw new Error('Sólo podés editar allanamientos registrados por tu usuario.')
    }
    if (!contexto.superintendenciaId || registro.superintendencia_id !== contexto.superintendenciaId) {
      throw new Error('El registro no pertenece a tu superintendencia asignada.')
    }
    const { inicio, fin } = obtenerRangoSemanaRendida()
    // Se verifica la fecha almacenada, antes de cargar o usar la fecha del formulario.
    if (!registro.fecha_ejecucion || registro.fecha_ejecucion < inicio || registro.fecha_ejecucion > fin) {
      throw new Error(`El registro pertenece a otro período. Sólo podés editar la semana rendida del ${inicio} al ${fin}.`)
    }
    if (!esVentanaOperativaValida()) {
      throw new Error('La ventana de edición está cerrada. Se habilita de lunes 00:00 hs a miércoles 08:00 hs, hora de Argentina.')
    }

    const { data: rendicion, error: rendicionError } = await supabase
      .from('rendiciones_allanamientos')
      .select('estado')
      .eq('superintendencia_id', contexto.superintendenciaId)
      .eq('semana_inicio', inicio)
      .maybeSingle()

    if (rendicionError) throw new Error('No fue posible verificar el estado del período. La edición permanece deshabilitada. Reintentá la verificación.')
    if (['finalizado', 'bloqueado'].includes(rendicion?.estado)) {
      throw new Error('La rendición de tu superintendencia está finalizada o bloqueada. No se permite editar este período.')
    }
    if (!esVentanaOperativaValida()) {
      throw new Error('La ventana de edición cerró durante la verificación. Se habilita de lunes 00:00 hs a miércoles 08:00 hs, hora de Argentina.')
    }
  }

  async function fetchMaestras() {
    try {
      const { data: partData, error: partError } = await supabase.from('partidos').select('nombre').order('nombre')
      if (partData) setPartidosList(partData.map(p => p.nombre))
      setPartidosError(Boolean(partError || !partData?.length))

      const { data: espData, error: espError } = await supabase.from('especialidades').select('nombre').order('nombre')
      setEspecialidadesList(espData?.map(e => e.nombre) ?? [])
      setEspecialidadesError(Boolean(espError || !espData?.length))

      const { data: superData } = await supabase.from('superintendencias').select('id, nombre').order('nombre')
      if (superData) setSuperintendenciasList(superData)
    } catch (err) {
      console.error('Error cargando tablas maestras:', err)
    }
  }

  async function fetchAllanamiento(contexto: ContextoEdicion) {
    try {
      const { data, error: fetchErr } = await supabase
        .from('allanamientos')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchErr) throw new Error(fetchErr.message || 'No se pudo encontrar el registro solicitado.')
      if (!data) throw new Error('No se encontró el registro solicitado.')

      await verificarEdicionOperador(contexto, data)

      if (data.horario_ejecucion) {
        const [h, m] = data.horario_ejecucion.split(':')
        if (h) setHoraEjecucion(h.padStart(2, '0'))
        if (m) setMinutoEjecucion(m.padStart(2, '0'))
      }
      setEnElActo(data.en_el_acto === true)

      // Cargar Armas desde JSON o columnas de BD
      let loadedArmas: { subtipo: string; cantidad: number }[] = []
      if (data.secuestro_armas) {
        let val = data.secuestro_armas
        if (typeof val === 'string') { try { val = JSON.parse(val) } catch {} }
        if (Array.isArray(val)) {
          loadedArmas = val.map((item: any) => ({
            subtipo: item.subtipo || item.tipo || 'Arma Corta',
            cantidad: parseInt(item.cantidad || item.cant || 1, 10) || 1
          }))
        }
      }

      // Cargar Vehículos
      let loadedVehiculos: { subtipo: string; cantidad: number }[] = []
      if (data.secuestro_vehiculos) {
        let val = data.secuestro_vehiculos
        if (typeof val === 'string') { try { val = JSON.parse(val) } catch {} }
        if (Array.isArray(val)) {
          loadedVehiculos = val.map((item: any) => ({
            subtipo: item.subtipo || item.tipo || 'Auto',
            cantidad: parseInt(item.cantidad || item.cant || 1, 10) || 1
          }))
        }
      }

      // Cargar Detenidos / Aprehendidos
      let loadedDetenidos: { subtipo: string; cantidad: number }[] = []
      if (data.detenidos_aprehendidos) {
        let val = data.detenidos_aprehendidos
        if (typeof val === 'string') { try { val = JSON.parse(val) } catch {} }
        if (Array.isArray(val)) {
          loadedDetenidos = val.map((item: any) => ({
            subtipo: item.subtipo || item.tipo || 'Detenido',
            cantidad: parseInt(item.cantidad || item.cant || 1, 10) || 1
          }))
        } else if (typeof val === 'number' && val > 0) {
          loadedDetenidos = [{ subtipo: 'Detenido', cantidad: val }]
        }
      }

      let obsLimpia = data.observaciones || ''

      // Fallback a texto en observaciones si no se mapeó por JSON
      if (obsLimpia.includes('Secuestros:')) {
        const [obsPart, secuestraPart] = obsLimpia.split(' - Secuestros:')
        obsLimpia = obsPart.trim()

        if (secuestraPart) {
          if (loadedArmas.length === 0) {
            const matchArmas = secuestraPart.match(/Armas\s*\[(.*?)\]/)
            if (matchArmas && matchArmas[1]) {
              loadedArmas = matchArmas[1].split(',').map((item: string) => {
                const [subtipo, cant] = item.split(':').map((s: string) => s.trim())
                return { subtipo: subtipo || 'Arma Corta', cantidad: parseInt(cant, 10) || 1 }
              })
            }
          }

          if (loadedVehiculos.length === 0) {
            const matchVeh = secuestraPart.match(/Vehículos\s*\[(.*?)\]/)
            if (matchVeh && matchVeh[1]) {
              loadedVehiculos = matchVeh[1].split(',').map((item: string) => {
                const [subtipo, cant] = item.split(':').map((s: string) => s.trim())
                return { subtipo: subtipo || 'Auto', cantidad: parseInt(cant, 10) || 1 }
              })
            }
          }

          if (loadedDetenidos.length === 0) {
            const matchDet = secuestraPart.match(/Personas\s*\[(.*?)\]/)
            if (matchDet && matchDet[1]) {
              loadedDetenidos = matchDet[1].split(',').map((item: string) => {
                const [subtipo, cant] = item.split(':').map((s: string) => s.trim())
                return { subtipo: subtipo || 'Detenido', cantidad: parseInt(cant, 10) || 1 }
              })
            }
          }
        }
      }

      if (loadedArmas.length > 0) setArmas(loadedArmas)
      if (loadedVehiculos.length > 0) setVehiculos(loadedVehiculos)
      if (loadedDetenidos.length > 0) setDetenidos(loadedDetenidos)

      setFormData({
        superintendencia_id: data.superintendencia_id || '',
        numero_ipp: data.numero_ipp || '',
        caratula: data.caratula || '',
        ufi_juzgado: data.ufi_juzgado || '',
        fecha_solicitud: data.fecha_solicitud || '',
        partido: data.partido || '',
        es_exhorto: data.es_exhorto === true,
        provincia: data.provincia || 'Buenos Aires',
        localidad: data.localidad || '',
        departamental: data.departamental || '',
        dependencia: data.dependencia || '',
        fecha_ejecucion: data.fecha_ejecucion || '',
        personal_propio: data.personal_propio ?? 1,
        resultado_medida: data.resultado_medida || 'Positivo',
        objetivos: data.objetivos ?? 1,
        resultado_secuestros: data.resultado_secuestros || ((loadedArmas.length > 0 || loadedVehiculos.length > 0 || loadedDetenidos.length > 0) ? 'Positivo' : 'Negativo'),
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

      return true
    } catch (err) {
      setBloqueoEdicion(err instanceof Error ? err.message : 'No fue posible verificar el registro solicitado. Reintentá la verificación.')
      return false
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
    const requiereHorario = formData.fecha_ejecucion >= '2026-09-28'
    if (requiereHorario && (!/^([01]\d|2[0-3])$/.test(horaEjecucion) || !/^[0-5]\d$/.test(minutoEjecucion))) {
      setError('Indicá la hora y los minutos de ejecución.')
      return
    }
    const errorFechas = validarFechasAllanamiento({
      fechaEjecucion: formData.fecha_ejecucion,
      fechaSolicitud: formData.fecha_solicitud,
      esElevado,
    })

    if (errorFechas) {
      setError(errorFechas)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const enElActoHistorico = !requiereHorario && enElActo
      const horarioFinal = enElActoHistorico || !horaEjecucion || !minutoEjecucion
        ? null : `${horaEjecucion}:${minutoEjecucion}`
      const provincia = formData.es_exhorto ? formData.provincia : 'Buenos Aires'
      if (!provincia || (provincia === 'Buenos Aires' ? !formData.partido : !formData.localidad.trim())) {
        throw new Error('Indicá el partido o la localidad de destino del exhorto.')
      }

      const secuestrosPositivos = formData.resultado_secuestros === 'Positivo'
      const armasValidas = secuestrosPositivos ? sanitizarDetalles(armas) : []
      const vehiculosValidos = secuestrosPositivos ? sanitizarDetalles(vehiculos) : []
      const detenidosValidos = secuestrosPositivos ? sanitizarDetalles(detenidos) : []
      const totalArmas = sumarDetalles(armasValidas)
      const totalVehiculos = sumarDetalles(vehiculosValidos)
      const totalDetenidos = sumarDetalles(detenidosValidos)

      const payloadAllanamiento = {
        superintendencia_id: formData.superintendencia_id,
        numero_ipp: formData.numero_ipp,
        caratula: formData.caratula,
        ufi_juzgado: formData.ufi_juzgado || 'Sin especificar',
        fecha_solicitud: formData.fecha_solicitud || null,
        fecha_ejecucion: formData.fecha_ejecucion,
        horario_ejecucion: horarioFinal,
        en_el_acto: enElActoHistorico,
        es_exhorto: formData.es_exhorto,
        provincia,
        localidad: provincia === 'Buenos Aires' ? null : formData.localidad.trim(),
        partido: provincia === 'Buenos Aires' ? formData.partido : null,
        lugar_presentacion: formData.dependencia || formData.partido || formData.localidad,
        departamental: formData.departamental || null,
        dependencia: formData.dependencia || 'Sin especificar',
        objetivos: Number(formData.objetivos) || 1,
        personal_propio: Number(formData.personal_propio) || 0,
        resultado_medida: formData.resultado_medida,
        es_positivo: formData.resultado_medida === 'Positivo',
        resultado_secuestros: formData.resultado_secuestros,
        secuestro_armas: armasValidas,
        secuestro_vehiculos: vehiculosValidos,
        detenidos_aprehendidos: detenidosValidos,
        armas_secuestradas: totalArmas,
        vehiculos_secuestrados: totalVehiculos,
        detenidos_aprehendidos_cant: totalDetenidos,
        orden_servicio_propia: formData.orden_servicio_propia || 'S/N',
        orden_servicio_cop: formData.orden_servicio_cop || null,
        numero_parte_urgente: formData.numero_parte_urgente || null,
        observaciones: formData.observaciones.trim() || null,
      }

      const colabValidas = colaboraciones.filter(c => c.especialidad)
      const colabToInsert = colabValidas.map(c => ({
        especialidad: c.especialidad,
        cant_solicitada: Number(c.cant_solicitada) || 0,
        cant_afectada: Number(c.cant_afectada) || 0
      }))

      if (!esElevado) {
        try {
          const contexto = await fetchPerfil()
          const { data: original, error: originalError } = await supabase
            .from('allanamientos')
            .select('operador_id, superintendencia_id, fecha_ejecucion')
            .eq('id', id)
            .single()
          if (originalError || !original) throw new Error('No fue posible verificar el registro original. Reintentá la verificación.')
          if (!contexto.elevado && payloadAllanamiento.superintendencia_id !== contexto.superintendenciaId) {
            throw new Error('No se puede trasladar el registro a otra superintendencia desde esta edición.')
          }
          await verificarEdicionOperador(contexto, original)
        } catch (err) {
          setBloqueoEdicion(err instanceof Error ? err.message : 'No fue posible verificar el estado del período. Reintentá la verificación.')
          return
        }
      }

      const { error: updateErr } = await supabase.rpc('actualizar_allanamiento_completo', {
        p_id: id,
        p_datos: payloadAllanamiento,
        p_colaboraciones: colabToInsert,
      })

      if (updateErr) throw updateErr

      router.refresh()
      router.push('/allanamientos')

    } catch (err: any) {
      console.error('Error al actualizar:', err)
      setError(err.message || 'Ocurrió un error al actualizar el registro.')
    } finally {
      setSaving(false)
    }
  }

  const rangoSemanaRendida = obtenerRangoSemanaRendida()

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-slate-100">
        <Loader2 className="h-5 w-5 animate-spin text-[#c4a35a]" />
        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-400">Cargando registro...</span>
      </div>
    )
  }

  if (bloqueoEdicion) {
    return (
      <div className="cop-form-page flex min-h-[62vh] items-center justify-center py-10 text-center">
        <section role="alert" className="w-full max-w-xl border border-[#26364d] border-l-4 border-l-amber-600 bg-[#071426] px-5 py-8 sm:px-8">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center border border-amber-800/70 bg-amber-950/30 text-amber-400">
            <Lock className="h-6 w-6" />
          </div>
          <p className="cop-kicker mb-2">Rectificación controlada</p>
          <h1 className="text-lg font-extrabold uppercase tracking-[0.04em] text-white">Edición no habilitada</h1>
          <p className="mb-6 mt-3 text-sm leading-relaxed text-slate-400">{bloqueoEdicion}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => router.push('/allanamientos')} className="cop-action-secondary">Volver a allanamientos</button>
            <button type="button" onClick={() => void inicializarEdicion()} className="cop-action-secondary">Reintentar verificación</button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="cop-form-page text-slate-100">
      <div className="space-y-6">
        
        <header className="cop-form-header">
            <button 
              type="button"
              onClick={() => router.back()}
              className="cop-form-back cursor-pointer"
              aria-label="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="cop-kicker mb-2">OP-03 · Rectificación controlada</p>
              <h1 className="text-xl font-black uppercase tracking-[0.035em] text-white sm:text-2xl">Editar allanamiento</h1>
              <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:text-sm">Registro asociado a la causa IPP: <span className="font-mono text-slate-200">{formData.numero_ipp}</span></p>
            </div>
        </header>

        {error && (
          <div className="border border-red-800/70 border-l-4 border-l-red-600 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="cop-operational-form space-y-6">

          {/* TARJETA 1 */}
          <section className="cop-form-section">
            <div className="cop-form-section-heading">
              <div className="cop-form-section-identity">
                <span className="cop-form-section-index">01</span>
                <div><h2 className="cop-form-section-title">Datos judiciales y de causa</h2><p className="cop-form-section-caption">Identificación del expediente y órdenes de servicio</p></div>
              </div>
            </div>
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
                  max={formData.fecha_ejecucion || rangoSemanaRendida.hoy}
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
          </section>

          {/* TARJETA 2 */}
          <section className="cop-form-section">
            <div className="cop-form-section-heading">
              <div className="cop-form-section-identity">
                <span className="cop-form-section-index">02</span>
                <div><h2 className="cop-form-section-title">Ubicación y jurisdicción</h2><p className="cop-form-section-caption">Destino institucional, dependencia, fecha y horario</p></div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

              {esElevado && (
                <div className="md:col-span-2 lg:col-span-3 bg-amber-950/20 border border-amber-800/40 p-3.5 rounded-xl mb-2">
                  <label className="block text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-amber-400" /> Superintendencia Asignada *
                  </label>
                  <select 
                    name="superintendencia_id"
                    value={formData.superintendencia_id} 
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="">Seleccione Superintendencia...</option>
                    {superintendenciasList.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="md:col-span-2 lg:col-span-3 flex items-center gap-3 text-sm text-slate-200">
                <input type="checkbox" checked={formData.es_exhorto}
                  onChange={(e) => setFormData(prev => ({ ...prev, es_exhorto: e.target.checked, provincia: 'Buenos Aires', localidad: '', partido: '' }))}
                  className="h-4 w-4 accent-blue-500" /> Exhorto (procedimiento fuera de la jurisdicción habitual)
              </label>
              {formData.es_exhorto && <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Provincia o CABA *</label>
                <select value={formData.provincia} required
                  onChange={(e) => setFormData(prev => ({ ...prev, provincia: e.target.value, partido: '', localidad: '' }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white">
                  {JURISDICCIONES_ARGENTINA.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>}

              {formData.provincia === 'Buenos Aires' ? <div>
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
                {partidosError && <p role="alert" className="mt-1 text-xs text-amber-400">No hay partidos disponibles en este entorno. Revisá el catálogo y tu acceso.</p>}
              </div> : <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Localidad / municipio *</label>
                <input name="localidad" value={formData.localidad} onChange={handleChange} required maxLength={150}
                  placeholder="Indique la localidad de destino"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white" />
              </div>}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Departamental</label>
                <input 
                  type="text" 
                  name="departamental" 
                  value={formData.departamental} 
                  onChange={handleChange}
                  required
                  maxLength={150}
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
                  required
                  maxLength={150}
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
                  min={esElevado ? undefined : rangoSemanaRendida.inicio}
                  max={esElevado ? rangoSemanaRendida.hoy : rangoSemanaRendida.fin}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer [color-scheme:dark]"
                />
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-400">Hora de ejecución (24 h){formData.fecha_ejecucion >= '2026-09-28' ? ' *' : ''}</span>
                  {formData.fecha_ejecucion < '2026-09-28' && <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input type="checkbox" checked={enElActo} onChange={e => setEnElActo(e.target.checked)} className="h-4 w-4 accent-blue-500" /> En el acto (histórico)
                  </label>}
                </div>
                <div className={`flex items-center gap-2 transition-opacity ${formData.fecha_ejecucion < '2026-09-28' && enElActo ? 'opacity-40' : ''}`}>
                  <select
                    disabled={formData.fecha_ejecucion < '2026-09-28' && enElActo}
                    required={formData.fecha_ejecucion >= '2026-09-28'}
                    aria-label="Hora de ejecución"
                    value={horaEjecucion}
                    onChange={(e) => setHoraEjecucion(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer text-center disabled:cursor-not-allowed"
                  >
                    <option value="">Hora</option>
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                      <option key={h} value={h} className="bg-slate-900 text-white">
                        {h} hs
                      </option>
                    ))}
                  </select>
                  <span className="text-white font-bold">:</span>
                  <select
                    disabled={formData.fecha_ejecucion < '2026-09-28' && enElActo}
                    required={formData.fecha_ejecucion >= '2026-09-28'}
                    aria-label="Minutos de ejecución"
                    value={minutoEjecucion}
                    onChange={(e) => setMinutoEjecucion(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer text-center disabled:cursor-not-allowed"
                  >
                    <option value="">Minuto</option>
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                      <option key={m} value={m} className="bg-slate-900 text-white">
                        {m} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* TARJETA 3 */}
          <section className="cop-form-section">
            <div className="cop-form-section-heading">
              <div className="cop-form-section-identity">
                <span className="cop-form-section-index">03</span>
                <div><h2 className="cop-form-section-title">Personal y resultado principal</h2><p className="cop-form-section-caption">Dotación propia, objetivos y resultado de la medida</p></div>
              </div>
            </div>
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
          </section>

          {/* TARJETA 4 */}
          <section className="cop-form-section">
            <div className="cop-form-section-heading">
              <div className="cop-form-section-identity">
                <span className="cop-form-section-index">04</span>
                <div><h2 className="cop-form-section-title">Personal en colaboración</h2><p className="cop-form-section-caption">Especialidades solicitadas y personal efectivamente afectado</p></div>
              </div>
              <button 
                type="button" 
                onClick={addColaboracion}
                className="cop-action-secondary w-full cursor-pointer sm:w-auto"
              >
                <Plus className="w-4 h-4" /> Agregar otra especialidad
              </button>
            </div>

            <div className="space-y-3">
              {especialidadesError && (
                <p role="alert" className="border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-xs text-amber-300">
                  No hay especialidades disponibles en este entorno. Revisá el catálogo y tu acceso antes de modificar personal en colaboración.
                </p>
              )}
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
                        className="p-2 text-red-400 hover:bg-red-950/30 rounded-lg transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* TARJETA 5 */}
          <section className="cop-form-section space-y-4">
            <div className="cop-form-section-heading">
              <div className="cop-form-section-identity">
                <span className="cop-form-section-index">05</span>
                <div><h2 className="cop-form-section-title">Secuestros y observaciones</h2><p className="cop-form-section-caption">Detalle de armas, vehículos, personas y notas complementarias</p></div>
              </div>
            </div>

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
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
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
                      <button type="button" onClick={() => removeItem(idx, armas, setArmas)} className="text-red-400 p-1 cursor-pointer">
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
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
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
                      <button type="button" onClick={() => removeItem(idx, vehiculos, setVehiculos)} className="text-red-400 p-1 cursor-pointer">
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
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
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
                      <button type="button" onClick={() => removeItem(idx, detenidos, setDetenidos)} className="text-red-400 p-1 cursor-pointer">
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
          </section>

          <div className="cop-form-actions">
            <button 
              type="button" 
              onClick={() => router.back()}
              className="cop-action-secondary w-full cursor-pointer sm:w-auto"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="cop-action-warning w-full cursor-pointer disabled:opacity-50 sm:w-auto"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Actualizando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Actualizar Allanamiento</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
