'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Plus, Trash2, Save, ShieldAlert, Building2, Loader2, Lock } from 'lucide-react'

const LOCAL_STORAGE_KEY = 'borrador_nuevo_allanamiento'

export default function NuevoAllanamientosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const superintendenciaUrl = searchParams.get('superintendencia_id')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Control de Ventana Operativa (Lunes 08:00 hs a Miércoles 08:00 hs)
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
    verificarVentanaOperativa()
    inicializarDatos()
  }, [])

  // Verificar la ventana temporal (Lunes 08:00 AM - Miércoles 08:00 AM)
  const verificarVentanaOperativa = () => {
    const ahora = new Date()
    const dia = ahora.getDay() // 0 = Dom, 1 = Lun, 2 = Mar, 3 = Mié, 4 = Jue, 5 = Vie, 6 = Sáb
    const hora = ahora.getHours()

    // Lunes (1) desde las 8:00 hasta Miércoles (3) a las 07:59
    let enVentana = false
    if (dia === 1 && hora >= 8) enVentana = true
    if (dia === 2) enVentana = true
    if (dia === 3 && hora < 8) enVentana = true

    setFueraDeVentana(!enVentana)
  }

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
      }
    } catch (e) {
      console.warn('No se pudo recuperar el borrador local:', e)
    }
  }

  // Guardar borrador local automáticamente ante cambios
  useEffect(() => {
    if (!fueraDeVentana) {
      const estadoCompleto = {
        formData,
        colaboraciones,
        armas,
        vehiculos,
        detenidos,
        horaEjecucion,
        minutoEjecucion
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(estadoCompleto))
    }
  }, [formData, colaboraciones, armas, vehiculos, detenidos, horaEjecucion, minutoEjecucion, fueraDeVentana])

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

        const rawRole = user.user_metadata?.role || user.app_metadata?.role || profile?.role || profile?.rol || ''
        const rolNormalizado = String(rawRole).toLowerCase().trim()

        const elevado = 
          rolNormalizado === 'supervisor' || 
          rolNormalizado === 'admin' || 
          rolNormalizado === 'superadmin' ||
          profile?.role_id === 2 || 
          profile?.role_id === 3

        setEsElevado(elevado)
        setSuperintendenciaUsuario(profile?.superintendencia_id || null)

        // Si viene por URL, la seteamos por defecto
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

      // Cargar borrador si no es admin/elevado o si desea restaurar
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

    // Si intenta enviar fuera de ventana (sin ser elevado), rebota
    if (fueraDeVentana && !esElevado) {
      setError('La ventana de carga se encuentra cerrada (Lunes 08:00hs a Miércoles 08:00hs).')
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

      let detalleSecuestrosTexto = ''
      if (formData.resultado_secuestros === 'Positivo') {
        const resumenArmas = armas.filter(a => a.cantidad > 0).map(a => `${a.subtipo}: ${a.cantidad}`).join(', ')
        const resumenVehiculos = vehiculos.filter(v => v.cantidad > 0).map(v => `${v.subtipo}: ${v.cantidad}`).join(', ')
        const resumenDetenidos = detenidos.filter(d => d.cantidad > 0).map(d => `${d.subtipo}: ${d.cantidad}`).join(', ')
        
        detalleSecuestrosTexto = [
          resumenArmas ? `Armas [${resumenArmas}]` : '',
          resumenVehiculos ? `Vehículos [${resumenVehiculos}]` : '',
          resumenDetenidos ? `Personas [${resumenDetenidos}]` : ''
        ].filter(Boolean).join(' | ')
      }

      const obsFinales = [formData.observaciones, detalleSecuestrosTexto ? `Secuestros: ${detalleSecuestrosTexto}` : '']
        .filter(Boolean)
        .join(' - ')

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
        orden_servicio_propia: formData.orden_servicio_propia || 'S/N',
        orden_servicio_cop: formData.orden_servicio_cop || null,
        numero_parte_urgente: formData.numero_parte_urgente || null,
        observaciones: obsFinales || null
      }

      const { data: allanamientoData, error: allanamientoError } = await supabase
        .from('allanamientos')
        .insert([payloadAllanamiento])
        .select()
        .single()

      if (allanamientoError) throw allanamientoError

      if (colaboraciones.length > 0 && colaboraciones[0].especialidad && allanamientoData) {
        const colabToInsert = colaboraciones.map(c => ({
          allanamiento_id: allanamientoData.id,
          especialidad: c.especialidad,
          cant_solicitada: Number(c.cant_solicitada) || 0,
          cant_afectada: Number(c.cant_afectada) || 0
        }))
        const { error: colabError } = await supabase.from('allanamiento_colaboraciones').insert(colabToInsert)
        if (colabError) throw colabError
      }

      // Si se guardó con éxito, vaciar el borrador
      localStorage.removeItem(LOCAL_STORAGE_KEY)

      router.push('/dashboard')

    } catch (err: any) {
      console.error('Error detallado:', err)
      setError(err.message || 'Ocurrió un error al guardar el registro.')
    } finally {
      setLoading(false)
    }
  }

  // Render si está fuera de ventana y no es Administrador/Supervisor
  if (fueraDeVentana && !esElevado) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mb-4 text-amber-400">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Fuera de Período de Carga</h1>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          El sistema solo habilita el registro de allanamientos desde los <span className="text-amber-400 font-semibold">Lunes a las 08:00 hs</span> hasta los <span className="text-amber-400 font-semibold">Miércoles a las 08:00 hs</span>.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-xl text-sm font-semibold transition"
        >
          Volver al Dashboard
        </button>
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
                <ShieldAlert className="w-6 h-6 text-blue-500" /> Registrar Nuevo Allanamiento
              </h1>
              <p className="text-sm text-slate-400">Complete los datos correspondientes al operativo realizado bajo su jurisdicción.</p>
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
          </div>

          {/* TARJETA 2 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <h2 className="text-base font-semibold text-blue-400 mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
              📍 2. Ubicación y Jurisdicción
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

              {/* DROPDOWN SOLO VISIBLE PARA SUPERVISORES / ADMINS */}
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
                placeholder="Detalles adicionales del procedimiento..."
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
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Allanamientos</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}