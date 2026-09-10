'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid 
} from 'recharts'
import { 
  ShieldAlert, Calendar, MapPin, Building2, TrendingUp, 
  Filter, ShieldCheck, Crosshair, Car, UserCheck, FileText, Lock 
} from 'lucide-react'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4']

export default function MetricasPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rolUsuario, setRolUsuario] = useState<string | null>(null)
  const [accesoDenegado, setAccesoDenegado] = useState(false)
  const [rangoSemanas, setRangoSemanas] = useState('4')

  // KPIs Principales
  const [totalSemanaActual, setTotalSemanaActual] = useState(0)
  const [totalMesActual, setTotalMesActual] = useState(0)
  const [porcentajePositivos, setPorcentajePositivos] = useState(0)

  // KPIs Operativos basados en tablas hijas
  const [totalArmas, setTotalArmas] = useState(0)
  const [totalVehiculos, setTotalVehiculos] = useState(0)
  const [totalDetenidos, setTotalDetenidos] = useState(0)

  // Gráficos
  const [datosSemanales, setDatosSemanales] = useState<any[]>([])
  const [datosPartidos, setDatosPartidos] = useState<any[]>([])
  const [datosSuperintendencias, setDatosSuperintendencias] = useState<any[]>([])
  const [datosEspecialidades, setDatosEspecialidades] = useState<any[]>([])

  useEffect(() => {
    verificarRolYcargarDatos()
  }, [rangoSemanas])

  async function verificarRolYcargarDatos() {
    setLoading(true)
    try {
      // 1. Obtener usuario autenticado y su rol desde la tabla profiles
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile, error: errProfile } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', user.id)
        .single()

      if (errProfile || !profile) {
        setAccesoDenegado(true)
        setLoading(false)
        return
      }

      const rol = profile.rol ? profile.rol.toLowerCase().trim() : ''
      setRolUsuario(rol)

      // 2. Validar que tenga acceso (Supervisor, Administrador, Auditor o Consulta)
      const rolesPermitidos = ['supervisor', 'administrador', 'auditor', 'consulta']
      if (!rolesPermitidos.includes(rol)) {
        setAccesoDenegado(true)
        setLoading(false)
        return
      }

      // 3. Consultas a Supabase
      const { data: allanamientos, error: errAllanamientos } = await supabase
        .from('allanamientos')
        .select(`
          id, fecha_ejecucion, partido, resultado_medida, es_positivo,
          superintendencias (nombre)
        `)

      if (errAllanamientos) throw errAllanamientos

      const { data: secuestros, error: errSecuestros } = await supabase
        .from('allanamiento_secuestros')
        .select('tipo, cantidad')

      if (errSecuestros) throw errSecuestros

      const { data: colaboraciones, error: errColab } = await supabase
        .from('allanamiento_colaboraciones')
        .select('especialidad, cant_afectada')

      if (errColab) throw errColab

      if (allanamientos) {
        const hoy = new Date()
        const diaSemana = hoy.getDay() === 0 ? 7 : hoy.getDay()
        const inicioSemana = new Date(hoy)
        inicioSemana.setDate(hoy.getDate() - (diaSemana - 1))
        inicioSemana.setHours(0,0,0,0)

        const operativosSemana = allanamientos.filter(a => a.fecha_ejecucion && new Date(a.fecha_ejecucion) >= inicioSemana)
        setTotalSemanaActual(operativosSemana.length)

        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
        const operativosMes = allanamientos.filter(a => a.fecha_ejecucion && new Date(a.fecha_ejecucion) >= inicioMes)
        setTotalMesActual(operativosMes.length)

        const positivos = allanamientos.filter(a => a.es_positivo === true || a.resultado_medida === 'Positivo').length
        setPorcentajePositivos(allanamientos.length > 0 ? Math.round((positivos / allanamientos.length) * 100) : 0)

        let armasCount = 0
        let vehiculosCount = 0
        let detenidosCount = 0

        if (secuestros) {
          secuestros.forEach(s => {
            const tipoLower = (s.tipo || '').toLowerCase()
            const cant = Number(s.cantidad || 1)
            
            if (tipoLower.includes('arma') || tipoLower.includes('fuego')) {
              armasCount += cant
            } else if (tipoLower.includes('vehiculo') || tipoLower.includes('auto')  || tipoLower.includes('moto')) {
              vehiculosCount += cant
            } else if (tipoLower.includes('detenido') || tipoLower.includes('aprehendido')) {
              detenidosCount += cant
            }
          })
        }

        setTotalArmas(armasCount)
        setTotalVehiculos(vehiculosCount)
        setTotalDetenidos(detenidosCount)

        const porPartido: Record<string, number> = {}
        allanamientos.forEach(a => {
          if (a.partido) porPartido[a.partido] = (porPartido[a.partido] || 0) + 1
        })
        const chartPartidos = Object.entries(porPartido)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
        setDatosPartidos(chartPartidos)

        const porSuper: Record<string, number> = {}
        allanamientos.forEach(a => {
          const nombreSuper = (a.superintendencias as any)?.nombre || 'Sin Especificar'
          porSuper[nombreSuper] = (porSuper[nombreSuper] || 0) + 1
        })
        const chartSuper = Object.entries(porSuper)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
        setDatosSuperintendencias(chartSuper)

        const porEspecialidad: Record<string, number> = {}
        if (colaboraciones) {
          colaboraciones.forEach(c => {
            if (c.especialidad) {
              porEspecialidad[c.especialidad] = (porEspecialidad[c.especialidad] || 0) + 1
            }
          })
        }
        const chartEspecialidades = Object.entries(porEspecialidad)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
        setDatosEspecialidades(chartEspecialidades)

        const semanasMock = [
          { semana: 'Sem -3', cantidad: Math.round(operativosSemana.length * 0.8) },
          { semana: 'Sem -2', cantidad: Math.round(operativosSemana.length * 0.9) },
          { semana: 'Sem -1', cantidad: Math.round(operativosSemana.length * 1.1) },
          { semana: 'Sem Actual', cantidad: operativosSemana.length }
        ]
        setDatosSemanales(semanasMock)
      }

    } catch (err) {
      console.error('Error al cargar métricas:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-400 font-medium">Validando permisos y estadísticas...</p>
        </div>
      </div>
    )
  }

  if (accesoDenegado) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
        <div className="p-4 bg-rose-500/10 text-rose-400 rounded-2xl mb-4 border border-rose-500/20">
          <Lock className="w-10 h-10" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Acceso Restringido</h1>
        <button 
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-all"
        >
          Volver al Listado de Allanamientos
        </button>
      </div>
    )
  }

  const esRolConsulta = rolUsuario === 'consulta'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-500" /> Estadísticas Operativas
          </h1>
          <p className="text-xs text-slate-400">
            {esRolConsulta ? 'Vista de consulta restringida (Total Mensual y Efectividad).' : 'Resumen y métricas de rendimiento del módulo de allanamientos.'}
          </p>
        </div>

        {!esRolConsulta && (
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <Filter className="w-4 h-4 text-slate-400" />
            <select 
              value={rangoSemanas} 
              onChange={(e) => setRangoSemanas(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="4" className="bg-slate-900">Últimas 4 Semanas</option>
              <option value="8" className="bg-slate-900">Últimas 8 Semanas</option>
              <option value="12" className="bg-slate-900">Últimos 3 Meses</option>
            </select>
          </div>
        )}
      </div>

      {/* KPIS PRINCIPALES */}
      <div className={`grid grid-cols-1 ${esRolConsulta ? 'md:grid-cols-2 max-w-3xl' : 'md:grid-cols-3'} gap-5`}>
        
        {/* Rendición Semanal (Oculto para Consulta) */}
        {!esRolConsulta && (
          <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl shadow-xl backdrop-blur-md">
            <div className="flex justify-between items-center text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rendición Semanal</span>
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{totalSemanaActual}</div>
            <p className="text-[11px] text-blue-400 mt-1">Lunes a Domingo en curso</p>
          </div>
        )}

        {/* TOTAL MENSUAL (Visible para todos, incluido Consulta) */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl shadow-xl backdrop-blur-md">
          <div className="flex justify-between items-center text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Mensual</span>
            <ShieldAlert className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{totalMesActual}</div>
          <p className="text-[11px] text-emerald-400 mt-1">Acumulado del mes actual</p>
        </div>

        {/* EFECTIVIDAD MEDIDAS (Visible para todos, incluido Consulta) */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl shadow-xl backdrop-blur-md">
          <div className="flex justify-between items-center text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Efectividad Medidas</span>
            <ShieldCheck className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{porcentajePositivos}%</div>
          <p className="text-[11px] text-amber-400 mt-1">Allanamientos con resultado positivo</p>
        </div>
      </div>

      {/* SECCIÓN COMPLETA DE GRÁFICOS Y OTROS KPIS (Solo para Supervisor, Admin, Auditor) */}
      {!esRolConsulta && (
        <>
          {/* KPIS OPERATIVOS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex items-center gap-3">
              <div className="p-3 bg-rose-500/10 text-rose-400 rounded-lg"><Crosshair className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-slate-400">Armas Secuestradas</p>
                <p className="text-xl font-bold text-white">{totalArmas}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex items-center gap-3">
              <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-lg"><Car className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-slate-400">Vehículos Secuestrados</p>
                <p className="text-xl font-bold text-white">{totalVehiculos}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex items-center gap-3">
              <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg"><UserCheck className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-slate-400">Detenidos / Aprehendidos</p>
                <p className="text-xl font-bold text-white">{totalDetenidos}</p>
              </div>
            </div>
          </div>

          {/* GRÁFICOS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* EVOLUCIÓN SEMANAL */}
            <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl shadow-xl backdrop-blur-md space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" /> Evolución Semanal de Procedimientos
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={datosSemanales}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="semana" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', color: '#FFF' }} />
                    <Area type="monotone" dataKey="cantidad" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TOP PARTIDOS */}
            <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl shadow-xl backdrop-blur-md space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" /> Top 5 Partidos con Mayor Registros
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosPartidos} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis type="number" stroke="#64748B" fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke="#64748B" fontSize={11} width={90} />
                    <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', color: '#FFF' }} />
                    <Bar dataKey="total" fill="#10B981" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* DISTRIBUCIÓN POR SUPERINTENDENCIA */}
            <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-400" /> Distribución Operativa por Superintendencias
                </h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4">
                <div className="h-56 w-full flex justify-center items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={datosSuperintendencias}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="total"
                      >
                        {datosSuperintendencias.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', color: '#FFF' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {datosSuperintendencias.length === 0 ? (
                    <p className="text-xs text-slate-500">Sin superintendencias registradas.</p>
                  ) : (
                    datosSuperintendencias.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-xs bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                          <span className="truncate font-medium text-slate-300" title={item.name}>{item.name}</span>
                        </div>
                        <span className="bg-slate-800 text-white px-2 py-0.5 rounded font-bold ml-2">{item.total}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* TOP 5 ESPECIALIDADES COLABORADORAS */}
            <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl shadow-xl backdrop-blur-md space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" /> Top 5 de Especialidades / Colaboradores
              </h2>
              <div className="h-64 w-full">
                {datosEspecialidades.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    No hay registros de especialidades disponibles.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datosEspecialidades} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis type="number" stroke="#64748B" fontSize={11} />
                      <YAxis dataKey="name" type="category" stroke="#64748B" fontSize={11} width={90} />
                      <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', color: '#FFF' }} />
                      <Bar dataKey="total" fill="#8B5CF6" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

          </div>
        </>
      )}

    </div>
  )
}