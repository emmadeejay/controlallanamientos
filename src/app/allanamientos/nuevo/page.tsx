'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Plus, Trash2, Save, Building2, Loader2, Lock } from 'lucide-react'
import {
  obtenerRangoSemanaRendida,
  sanitizarDetalles,
  sumarDetalles,
  validarFechasAllanamiento,
} from '@/lib/allanamientos'
import { perfilTieneAcceso } from '@/lib/usuarios'

const LOCAL_STORAGE_KEY = 'borrador_nuevo_allanamiento'

// Sincronización precisa con la hora oficial de Argentina (UTC-3)
// Regla: Desde Lunes 00:00 hs hasta Miércoles 08:00 hs
function esVentanaOperativaValida(): boolean {
  const ahora = new Date()
  
  const formatterDia = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' })
  const diaStr = formatterDia.format(ahora)
  const diasMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dia = diasMap[diaStr] ?? ahora.getDay()
  
  const formatterHora = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false, hour: 'numeric' })
  const partes = formatterHora.formatToParts(ahora)
  const horaPart = partes.find(p => p.type === 'hour')
  const hora = horaPart ? parseInt(horaPart.value, 10) : ahora.getHours()

  // Lunes (1) completo desde las 00:00 hs
  if (dia === 1) return true
  // Martes (2) completo
  if (dia === 2) return true
  // Miércoles (3) hasta las 07:59 hs
  if (dia === 3 && hora < 8) return true

  return false
}

export default function NuevoAllanamientosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const superintendenciaUrl = searchParams.get('superintendencia_id')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Control de Ventana Operativa (Lunes 00:00 hs a Miércoles 08:00 hs)
  const [fueraDeVentana, setFueraDeVentana] = useState(false)

  // Rol y Permisos del Usuario Logueado
  const [esElevado, setEsElevado] = useState(false)
  const [superintendenciaUsuario, setSuperintendenciaUsuario] = useState<string | null>(null)

  // Listas maestras
  const [partidosList, setPartidosList] = useState<string[]>([])
  const [especialidadesList, setEspecialidadesList] = useState<string[]>([])
  const [superintendenciasList, setSuperintendenciasList] = useState<{ id: string; nombre: string }[]>([])

  // Estado para la superintendencia seleccionada manualmente (Admin/Supervisor)
  const [superintendenciaSeleccionada, setSuperintendenciaSeleccionada] = useState<string>('')

  // Estados separados para hora y minuto en formato 24hs
  const [horaEjecucion, setHoraEjecucion] = useState('12')
  const [minutoEjecucion, setMinutoEjecucion] = useState('00')

  // Estado del formulario principal
  const [formData, setFormData] = useState({
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

  // Tarjeta 4: Personal en colaboración
  const [colaboraciones, setColaboraciones] = useState([
    { especialidad: '', cant_solicitada: 1, cant_afectada: 1 }
  ])

  // Tarjeta 5: Secuestros detallados
  const [armas, setArmas] = useState<{ subtipo: string; cantidad: number }[]>([])
  const [vehiculos, setVehiculos] = useState<{ subtipo: string; cantidad: number }[]>([])
  const [detenidos, setDetenidos] = useState<{ subtipo: string; cantidad: number }[]>([])

  useEffect(() => {
    const enVentana = esVentanaOperativaValida()
    setFueraDeVentana(!enVentana)
    inicializarDatos()
  }, [])

  // Carga de borradores locales al iniciar
  const cargarBorrador = () => {
    try {
      const borrador = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (borrador) {
        const parsed = JSON.parse(borrador)
        if (parsed.formData) setFormData(parsed.formData)
        if (parsed.colaboraciones) setColaboraciones(parsed.colaboraciones)
        if (parsed.armas) setArmas(parsed.armas)
        if (parsed.vehiculos) setVehiculos(parsed.vehiculos)
        if (parsed.detenidos) setDetenidos(parsed.detenidos)
        if (parsed.horaEjecucion) setHoraEjecucion(parsed.horaEjecucion)
        if (parsed.minutoEjecucion) setMinutoEjecucion(parsed.minutoEjecucion)
        if (parsed.superintendenciaSeleccionada) setSuperintendenciaSeleccionada(parsed.superintendenciaSeleccionada)
      }
    } catch (e) {
      console.warn('No se pudo recuperar el borrador local:', e)
    }
  }

  // Guardar borrador local automáticamente ante cambios
  useEffect(() => {
    if (!fueraDeVentana || esElevado) {
      const estadoCompleto = {
        formData,
        colaboraciones,
        armas,
        vehiculos,
        detenidos,
        horaEjecucion,
        minutoEjecucion,
        superintendenciaSeleccionada
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(estadoCompleto))
    }
  }, [formData, colaboraciones, armas, vehiculos, detenidos, horaEjecucion, minutoEjecucion, superintendenciaSeleccionada, fueraDeVentana, esElevado])

  async function inicializarDatos() {
    try {
      // 1. Obtener usuario y perfil
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()

        // El rol autorizado siempre sale de public.profiles. Los metadatos del
        // usuario no se usan para elevar permisos porque pueden quedar obsoletos.
        const rawRole = profile?.rol || profile?.role || ''
        const rolNormalizado = String(rawRole).toLowerCase().trim()

        const elevado = 
          rolNormalizado === 'supervisor' || 
          rolNormalizado === 'administrador' || 
          rolNormalizado === 'admin' || 
          rolNormalizado === 'superadmin' ||
          profile?.role_id === 2 || 
          profile?.role_id === 3

        const puedeCargar = !!profile && perfilTieneAcceso(profile) && (
          elevado
          || (rolNormalizado === 'operador' && profile?.modulos_permitidos?.includes('allanamientos'))
        )

        if (!puedeCargar) {
          router.replace('/allanamientos')
          return
        }

        setEsElevado(elevado)
        setSuperintendenciaUsuario(profile?.superintendencia_id || null)

        if (superintendenciaUrl && superintendenciaUrl !== 'TODAS') {
          setSuperintendenciaSeleccionada(superintendenciaUrl)
        } else if (profile?.superintendencia_id) {
          setSuperintendenciaSeleccionada(profile.superintendencia_id)
        }
      }

      // 2. Cargar tablas maestras
      const { data: partData } = await supabase.from('partidos').select('nombre').order('nombre')
      if (partData) setPartidosList(partData.map(p => p.nombre))

      const { data: espData } = await supabase.from('especialidades').select('nombre').order('nombre')
      if (espData) setEspecialidadesList(espData.map(e => e.nombre))

      const { data: superData } = await supabase.from('superintendencias').select('id, nombre').order('nombre')
      if (superData) setSuperintendenciasList(superData)

      cargarBorrador()

    } catch (err) {
      console.error('Error inicializando datos:', err)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // Manejadores para Colaboraciones
  const addColaboracion = () => {
    setColaboraciones(prev => [...prev, { especialidad: '', cant_solicitada: 1, cant_afectada: 1 }])
  }
  const removeColaboracion = (index: number) => {
    setColaboraciones(prev => prev.filter((_, i) => i !== index))
  }
  const handleColabChange = (index: number, field: string, value: any) => {
    const updated = [...colaboraciones]
    updated[index] = { ...updated[index], [field]: value }
    setColaboraciones(updated)
  }

  // Manejadores para Secuestros
  const addItem = (list: any[], setList: Function, template: object) => {
    setList([...list, template])
  }
  const removeItem = (index: number, list: any[], setList: Function) => {
    setList(list.filter((_, i) => i !== index))
  }
  const handleItemChange = (index: number, field: string, value: any, list: any[], setList: Function) => {
    const updated = [...list]
    updated[index] = { ...updated[index], [field]: value }
    setList(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (fueraDeVentana && !esElevado) {
      setError('La ventana de carga se encuentra cerrada (Lunes 00:00hs a Miércoles 08:00hs).')
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

    setLoading(true)
    setError(null)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('No se encontró una sesión de usuario activa.')

      let targetSuperintendenciaId = esElevado 
        ? superintendenciaSeleccionada 
        : superintendenciaUsuario

      if (!targetSuperintendenciaId) {
        throw new Error('Debe seleccionar o tener asignada una Superintendencia válida.')
      }

      const horarioFinal = `${horaEjecucion}:${minutoEjecucion}`

      const secuestrosPositivos = formData.resultado_secuestros === 'Positivo'
      const armasValidas = secuestrosPositivos ? sanitizarDetalles(armas) : []
      const vehiculosValidos = secuestrosPositivos ? sanitizarDetalles(vehiculos) : []
      const detenidosValidos = secuestrosPositivos ? sanitizarDetalles(detenidos) : []
      const totalArmas = sumarDetalles(armasValidas)
      const totalVehiculos = sumarDetalles(vehiculosValidos)
      const totalDetenidos = sumarDetalles(detenidosValidos)

      const payloadAllanamiento = {
        operador_id: user.id,
        superintendencia_id: targetSuperintendenciaId,
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
        secuestro_armas: armasValidas,
        secuestro_vehiculos: vehiculosValidos,
        detenidos_aprehendidos: detenidosValidos,
        armas_secuestradas: totalArmas,
        vehiculos_secuestrados: totalVehiculos,
        detenidos_aprehendidos_cant: totalDetenidos,
        orden_servicio_propia: formData.orden_servicio_propia || 'S/N',
        orden_servicio_cop: formData.orden_servicio_cop || null,
        numero_parte_urgente: formData.numero_parte_urgente || null,
        observaciones: formData.observaciones.trim() || null
      }

      const colaboracionesValidas = colaboraciones.filter(c => c.especialidad)
      const colabToInsert = colaboracionesValidas.map(c => ({
        especialidad: c.especialidad,
        cant_solicitada: Number(c.cant_solicitada) || 0,
        cant_afectada: Number(c.cant_afectada) || 0
      }))

      const { error: guardarError } = await supabase.rpc('crear_allanamiento_completo', {
        p_datos: payloadAllanamiento,
        p_colaboraciones: colabToInsert,
      })

      if (guardarError) throw guardarError

      // Vaciar borrador tras guardar correctamente
      localStorage.removeItem(LOCAL_STORAGE_KEY)

      router.push('/allanamientos')

    } catch (err: any) {
      console.error('Error detallado:', err)
      setError(err.message || 'Ocurrió un error al guardar el registro.')
    } finally {
      setLoading(false)
    }
  }

  const rangoSemanaRendida = obtenerRangoSemanaRendida()

  if (fueraDeVentana && !esElevado) {
    return (
      <div className="cop-form-page flex min-h-[62vh] items-center justify-center py-10 text-center">
        <section className="w-full max-w-xl border border-[#26364d] border-l-4 border-l-amber-600 bg-[#071426] px-5 py-8 sm:px-8">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center border border-amber-800/70 bg-amber-950/30 text-amber-400">
            <Lock className="h-6 w-6" />
          </div>
          <p className="cop-kicker mb-2">Ventana operativa cerrada</p>
          <h1 className="text-lg font-extrabold uppercase tracking-[0.04em] text-white">Fuera de período de carga</h1>
          <p className="mx-auto mb-6 mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            El registro se habilita desde el <span className="font-semibold text-amber-400">lunes a las 00:00 hs</span> hasta el <span className="font-semibold text-amber-400">miércoles a las 08:00 hs</span>.
          </p>
          <button type="button" onClick={() => router.push('/allanamientos')} className="cop-action-secondary">
            Volver a allanamientos
          </button>
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
              <p className="cop-kicker mb-2">OP-02 · Alta operativa</p>
              <h1 className="text-xl font-black uppercase tracking-[0.035em] text-white sm:text-2xl">Registrar nuevo allanamiento</h1>
              <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:text-sm">Completá los datos del procedimiento ejecutado bajo la jurisdicción correspondiente.</p>
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
                  placeholder="Ej: 06-00-123456-26"
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
                  placeholder="Ej: Robo calificado y portación ilegal"
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
                  placeholder="Ej: UFI N° 5 San Martín"
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
                  placeholder="Ej: 1234/2026"
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
                  placeholder="Ej: 123/26 o URGENCIA"
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
                  placeholder="Ej: AN1-1234/26"
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
                <div className="md:col-span-2 lg:col-span-3 bg-blue-950/20 border border-blue-800/40 p-3.5 rounded-xl mb-2">
                  <label className="block text-xs font-semibold text-blue-300 mb-1 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-blue-400" /> Superintendencia de Destino *
                  </label>
                  <select 
                    value={superintendenciaSeleccionada} 
                    onChange={(e) => setSuperintendenciaSeleccionada(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-blue-500/40 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-400 cursor-pointer"
                  >
                    <option value="">Seleccione a qué Superintendencia asignar este registro...</option>
                    {superintendenciasList.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Como usuario supervisor/administrador, debe especificar a qué área pertenece el registro.
                  </p>
                </div>
              )}

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
                  placeholder="Ej: Conurbano Norte"
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
                  placeholder="Ej: Comisaría San Fernando 1ra"
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
                        <option key={i} value={i} className="bg-slate-900 text-white">
                          {i}
                        </option>
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
                        <option key={i} value={i} className="bg-slate-900 text-white">
                          {i}
                        </option>
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

                  {armas.length === 0 && (
                    <p className="text-xs text-slate-500 italic py-1">Sin armas agregadas.</p>
                  )}

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
                          <option key={i} value={i} className="bg-slate-900 text-white">
                            {i}
                          </option>
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

                  {vehiculos.length === 0 && (
                    <p className="text-xs text-slate-500 italic py-1">Sin vehículos agregados.</p>
                  )}

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
                          <option key={i} value={i} className="bg-slate-900 text-white">
                            {i}
                          </option>
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

                  {detenidos.length === 0 && (
                    <p className="text-xs text-slate-500 italic py-1">Sin detenidos agregados.</p>
                  )}

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
                          <option key={i} value={i} className="bg-slate-900 text-white">
                            {i}
                          </option>
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
                placeholder="Detalles adicionales del procedimiento..."
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
              disabled={loading}
              className="cop-action-primary w-full cursor-pointer disabled:opacity-50 sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Allanamiento</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
