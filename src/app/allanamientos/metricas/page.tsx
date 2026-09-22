'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { obtenerRangoSemanaRendida } from '@/lib/allanamientos';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { Calendar, ShieldCheck, ShieldAlert, Car, Shield, UserCheck, TrendingUp, Radio, Lock } from 'lucide-react';

type DesgloseArmas = {
  'Arma Corta': number;
  'Arma Larga': number;
  'Arma Blanca': number;
  'Réplica': number;
};

type DesgloseVehiculos = {
  'Auto': number;
  'Moto': number;
  'Camioneta': number;
  'Otros': number;
};

type DesglosePersonas = {
  'Detenido': number;
  'Aprehendido': number;
};

const ROLES_PERMITIDOS = ['AUDITOR', 'CONSULTA', 'ADMINISTRADOR', 'SUPERVISOR'];

const supabase = createClient();

export default function MetricasPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string>('');
  const [errorCarga, setErrorCarga] = useState('');
  const [semanaDesde, setSemanaDesde] = useState('');
  const [semanaHasta, setSemanaHasta] = useState('');
  
  const [rendicionSemanal, setRendicionSemanal] = useState(0);
  const [totalMensual, setTotalMensual] = useState(0);
  const [efectividad, setEfectividad] = useState(100);
  
  const [armasSemana, setArmasSemana] = useState(0);
  const [vehiculosSemana, setVehiculosSemana] = useState(0);
  const [detenidosSemana, setDetenidosSemana] = useState(0);

  const [armasMes, setArmasMes] = useState(0);
  const [vehiculosMes, setVehiculosMes] = useState(0);
  const [detenidosMes, setDetenidosMes] = useState(0);

  const [desgloseArmas, setDesgloseArmas] = useState<DesgloseArmas>({
    'Arma Corta': 0, 'Arma Larga': 0, 'Arma Blanca': 0, 'Réplica': 0
  });
  const [desgloseVehiculos, setDesgloseVehiculos] = useState<DesgloseVehiculos>({
    'Auto': 0, 'Moto': 0, 'Camioneta': 0, 'Otros': 0
  });
  const [desglosePersonas, setDesglosePersonas] = useState<DesglosePersonas>({
    'Detenido': 0, 'Aprehendido': 0
  });

  const [datosEvolucion, setDatosEvolucion] = useState<any[]>([]);
  const [datosPartidos, setDatosPartidos] = useState<any[]>([]);
  const [datosSuperintendencias, setDatosSuperintendencias] = useState<any[]>([]);
  const [datosEspecialidades, setDatosEspecialidades] = useState<any[]>([]);

  useEffect(() => {
    async function verificarPermisos() {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        setAutorizado(false);
        setLoading(false);
        return;
      }

      const { data: perfil } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', user.id)
        .maybeSingle();

      const rolTabla = String(perfil?.rol ?? '').toUpperCase();
      setAutorizado(ROLES_PERMITIDOS.includes(rolTabla));
    }

    verificarPermisos();
  }, []);

  useEffect(() => {
    if (!autorizado) return;

    void cargarMetricas();

    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const solicitarActualizacion = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => void cargarMetricas(), 1200);
    };

    const intervalId = setInterval(() => void cargarMetricas(), 60000);

    const canalRealtime = supabase
      .channel('metricas-allanamientos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'allanamientos' },
        solicitarActualizacion,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'allanamiento_colaboraciones' },
        solicitarActualizacion,
      )
      .subscribe();

    return () => {
      clearInterval(intervalId);
      if (temporizador) clearTimeout(temporizador);
      supabase.removeChannel(canalRealtime);
    };
  }, [autorizado]);

  async function cargarMetricas() {
    try {
      const { inicio } = obtenerRangoSemanaRendida();
      const { data, error } = await supabase.rpc('metricas_allanamientos_semana', {
        p_semana_inicio: inicio,
      });

      if (error) {
        throw error;
      }

      const metricas = (data ?? {}) as Record<string, any>;
      setErrorCarga('');
      setSemanaDesde(String(metricas.semana_desde ?? inicio));
      setSemanaHasta(String(metricas.semana_hasta ?? ''));
      setRendicionSemanal(Number(metricas.rendicion_semanal) || 0);
      setTotalMensual(Number(metricas.total_mensual) || 0);
      setEfectividad(Number(metricas.efectividad) || 0);
      setArmasSemana(Number(metricas.armas_semana) || 0);
      setVehiculosSemana(Number(metricas.vehiculos_semana) || 0);
      setDetenidosSemana(Number(metricas.personas_semana) || 0);
      setArmasMes(Number(metricas.armas_mes) || 0);
      setVehiculosMes(Number(metricas.vehiculos_mes) || 0);
      setDetenidosMes(Number(metricas.personas_mes) || 0);

      const armas = metricas.desglose_armas ?? {};
      const vehiculos = metricas.desglose_vehiculos ?? {};
      const personas = metricas.desglose_personas ?? {};

      setDesgloseArmas({
        'Arma Corta': Number(armas['Arma Corta']) || 0,
        'Arma Larga': Number(armas['Arma Larga']) || 0,
        'Arma Blanca': Number(armas['Arma Blanca']) || 0,
        'Réplica': Number(armas['Réplica']) || 0,
      });

      setDesgloseVehiculos({
        'Auto': Number(vehiculos.Auto) || 0,
        'Moto': Number(vehiculos.Moto) || 0,
        'Camioneta': Number(vehiculos.Camioneta) || 0,
        'Otros': Number(vehiculos.Otros) || 0,
      });

      setDesglosePersonas({
        'Detenido': Number(personas.Detenido) || 0,
        'Aprehendido': Number(personas.Aprehendido) || 0,
      });
      setDatosEvolucion(Array.isArray(metricas.evolucion) ? metricas.evolucion : []);
      setDatosPartidos(Array.isArray(metricas.partidos) ? metricas.partidos : []);
      setDatosSuperintendencias(Array.isArray(metricas.superintendencias) ? metricas.superintendencias : []);
      setDatosEspecialidades(Array.isArray(metricas.especialidades) ? metricas.especialidades : []);

      setUltimaActualizacion(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('Error cargando métricas:', err);
      setErrorCarga('No se pudieron actualizar los indicadores. Verificá que la Fase 02.1 esté aplicada en Supabase.');
    } finally {
      setLoading(false);
    }
  }

  if (autorizado === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-full mb-4">
          <Lock className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Acceso Restringido</h2>
        <p className="text-xs text-slate-400 max-w-sm mb-6">
          Tu rol no tiene los permisos requeridos para visualizar el panel de métricas y estadísticas operativas.
        </p>
        <button
          onClick={() => router.push('/allanamientos')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors border border-slate-700"
        >
          Volver a Allanamientos
        </button>
      </div>
    );
  }

  if (loading || autorizado === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-xs">
        Verificando credenciales e indicadores operativos...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
      <div className="flex justify-between items-center bg-slate-900/40 border border-slate-800/80 px-4 py-2 rounded-xl backdrop-blur-md">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          MONITOREO AUDITORÍA EN VIVO
        </div>
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
          Última actualización: <span className="text-white font-mono">{ultimaActualizacion}</span>
        </div>
      </div>

      {errorCarga && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {errorCarga}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Rendición Semanal</span>
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{rendicionSemanal}</div>
          <p className="text-[10px] text-slate-500 mt-1">Semana informada: {semanaDesde} al {semanaHasta}</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Mensual</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{totalMensual}</div>
          <p className="text-[10px] text-slate-500 mt-1">Acumulado del mes actual</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Efectividad Medidas</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{efectividad}%</div>
          <p className="text-[10px] text-slate-500 mt-1">Allanamientos con resultado positivo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Armas Secuestradas</span>
              <ShieldAlert className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{armasSemana}</div>
            <p className="text-[10px] text-slate-500 mt-1">Semana informada ({armasMes} en el mes)</p>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-3 mt-3 border-t border-slate-800/80 text-[11px]">
            <div className="text-slate-400">Corta: <span className="font-semibold text-white">{desgloseArmas['Arma Corta']}</span></div>
            <div className="text-slate-400">Larga: <span className="font-semibold text-white">{desgloseArmas['Arma Larga']}</span></div>
            <div className="text-slate-400">Blanca: <span className="font-semibold text-white">{desgloseArmas['Arma Blanca']}</span></div>
            <div className="text-slate-400">Réplica: <span className="font-semibold text-white">{desgloseArmas['Réplica']}</span></div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Vehículos Secuestrados</span>
              <Car className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{vehiculosSemana}</div>
            <p className="text-[10px] text-slate-500 mt-1">Semana informada ({vehiculosMes} en el mes)</p>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-3 mt-3 border-t border-slate-800/80 text-[11px]">
            <div className="text-slate-400">Auto: <span className="font-semibold text-white">{desgloseVehiculos['Auto']}</span></div>
            <div className="text-slate-400">Moto: <span className="font-semibold text-white">{desgloseVehiculos['Moto']}</span></div>
            <div className="text-slate-400">Camioneta: <span className="font-semibold text-white">{desgloseVehiculos['Camioneta']}</span></div>
            <div className="text-slate-400">Otros: <span className="font-semibold text-white">{desgloseVehiculos['Otros']}</span></div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Detenidos / Aprehendidos</span>
              <UserCheck className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{detenidosSemana}</div>
            <p className="text-[10px] text-slate-500 mt-1">Semana informada ({detenidosMes} en el mes)</p>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-3 mt-3 border-t border-slate-800/80 text-[11px]">
            <div className="text-slate-400">Detenido: <span className="font-semibold text-white">{desglosePersonas['Detenido']}</span></div>
            <div className="text-slate-400">Aprehendido: <span className="font-semibold text-white">{desglosePersonas['Aprehendido']}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <h3 className="text-xs font-bold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" /> Evolución Semanal de Procedimientos
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosEvolucion}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} name="Allanamientos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <h3 className="text-xs font-bold text-white mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> Top 5 Partidos con más registros · Semana informada
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosPartidos} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" fontSize={10} allowDecimals={false} />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={100} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} name="Registros" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <h3 className="text-xs font-bold text-white mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" /> Distribución por Superintendencias · Semana informada
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosSuperintendencias} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" fontSize={10} allowDecimals={false} />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={9} width={130} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                <Bar dataKey="total" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Procedimientos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <h3 className="text-xs font-bold text-white mb-4 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-purple-400" /> Top 5 de Especialidades · Personal afectado
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosEspecialidades} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" fontSize={10} allowDecimals={false} />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={100} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} />
                <Bar dataKey="total" fill="#a855f7" radius={[0, 4, 4, 0]} name="Intervenciones" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  ); 
}
