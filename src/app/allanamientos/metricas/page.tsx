'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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

function parseFechaLocal(fechaStr: any): Date {
  if (!fechaStr) return new Date(0);
  if (fechaStr instanceof Date) return fechaStr;

  const str = String(fechaStr).replace('Z', '').split('.')[0];
  const partes = str.split('T');
  const fechaPartes = partes[0].split('-');

  if (fechaPartes.length === 3) {
    const anio = parseInt(fechaPartes[0], 10);
    const mes = parseInt(fechaPartes[1], 10) - 1;
    const dia = parseInt(fechaPartes[2], 10);

    let hora = 0, min = 0, seg = 0;
    if (partes[1]) {
      const horaPartes = partes[1].split(':');
      hora = parseInt(horaPartes[0] || '0', 10);
      min = parseInt(horaPartes[1] || '0', 10);
      seg = parseInt(horaPartes[2] || '0', 10);
    }
    return new Date(anio, mes, dia, hora, min, seg);
  }

  return new Date(fechaStr);
}

function getRangoSemanaActual() {
  const ahora = new Date();
  const diaSemana = ahora.getDay();
  const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;

  const inicio = new Date(ahora);
  inicio.setDate(ahora.getDate() + diffLunes);
  inicio.setHours(0, 0, 0, 0);

  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);
  fin.setHours(23, 59, 59, 999);

  return { inicio, fin };
}

function getRangoMesActual() {
  const ahora = new Date();
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0);
  const fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59);
  return { inicio, fin };
}

function procesarDetallesExhaustivo(registros: any[], campoJson: string) {
  const conteo: Record<string, number> = {
    'Arma Corta': 0, 'Arma Larga': 0, 'Arma Blanca': 0, 'Réplica': 0,
    'Auto': 0, 'Moto': 0, 'Camioneta': 0, 'Otros': 0,
    'Detenido': 0, 'Aprehendido': 0
  };

  registros.forEach(item => {
    let contenido = item[campoJson];
    if (!contenido) return;

    if (typeof contenido === 'string') {
      try { 
        contenido = JSON.parse(contenido); 
      } catch { 
        const valNum = parseInt(contenido, 10);
        if (!isNaN(valNum) && valNum > 0) contenido = valNum;
      }
    }

    if (typeof contenido === 'number' && contenido > 0) {
      if (campoJson === 'detenidos_aprehendidos') {
        conteo['Detenido'] += contenido;
      }
      return;
    }

    if (Array.isArray(contenido)) {
      contenido.forEach((element: any) => {
        if (!element) return;

        const tipoStr = (
          element.subtipo || 
          element.tipo || 
          element.categoria || 
          (typeof element === 'string' ? element : '')
        ).toLowerCase();

        const cant = parseInt(element.cantidad || element.cant || 1, 10) || 1;

        if (tipoStr.includes('corta')) conteo['Arma Corta'] += cant;
        else if (tipoStr.includes('larga')) conteo['Arma Larga'] += cant;
        else if (tipoStr.includes('blanca')) conteo['Arma Blanca'] += cant;
        else if (tipoStr.includes('replica') || tipoStr.includes('réplica')) conteo['Réplica'] += cant;
        else if (tipoStr.includes('auto') || tipoStr.includes('vehiculo')) conteo['Auto'] += cant;
        else if (tipoStr.includes('moto')) conteo['Moto'] += cant;
        else if (tipoStr.includes('camion')) conteo['Camioneta'] += cant;
        else if (tipoStr.includes('detenido')) conteo['Detenido'] += cant;
        else if (tipoStr.includes('aprehendido')) conteo['Aprehendido'] += cant;
        else if (campoJson === 'secuestro_vehiculos' && tipoStr) conteo['Otros'] += cant;
      });
    }
  });

  return conteo;
}

export default function MetricasPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [loading, setLoading] = useState(true);
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string>('');
  
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
      // Se eliminó la lectura de localStorage[cite: 8]. Ahora se consulta la sesión real almacenada en cookies.
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        setAutorizado(false);
        setLoading(false);
        return;
      }

      // Validamos contra la tabla profiles para mayor seguridad
      const { data: perfil } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', user.id)
        .maybeSingle();

      if (perfil && perfil.rol) {
        const rolTabla = String(perfil.rol).toUpperCase();
        setAutorizado(ROLES_PERMITIDOS.includes(rolTabla));
      } else {
        // Fallback a metadata si no se encuentra el perfil
        const rolMetadata = (user.user_metadata?.role || user.user_metadata?.rol || '').toUpperCase();
        setAutorizado(ROLES_PERMITIDOS.includes(rolMetadata));
      }
    }

    verificarPermisos();
  }, [supabase]);

  useEffect(() => {
    if (!autorizado) return;

    cargarMetricas();

    const intervalId = setInterval(() => {
      cargarMetricas();
    }, 5000);

    const canalRealtime = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        () => {
          cargarMetricas();
        }
      )
      .subscribe();

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(canalRealtime);
    };
  }, [autorizado, supabase]);

  async function cargarMetricas() {
    try {
      const { data, error } = await supabase
        .from('allanamientos')
        .select('*, superintendencias(nombre)');

      if (error) {
        console.error('Error al traer allanamientos:', error);
        return;
      }

      if (!data || data.length === 0) {
        setLoading(false);
        return;
      }

      let colaboracionesData: any[] = [];
      try {
        const { data: colabs } = await supabase.from('allanamiento_colaboraciones').select('*');
        if (colabs) colaboracionesData = colabs;
      } catch (e) {
        console.warn('Sin acceso a allanamiento_colaboraciones:', e);
      }

      const { inicio: inicioSemana, fin: finSemana } = getRangoSemanaActual();
      const { inicio: inicioMes, fin: finMes } = getRangoMesActual();

      const registrosSemana = data.filter(item => {
        const f = parseFechaLocal(item.fecha_ejecucion || item.fecha || item.created_at);
        return f >= inicioSemana && f <= finSemana;
      });

      const registrosMes = data.filter(item => {
        const f = parseFechaLocal(item.fecha_ejecucion || item.fecha || item.created_at);
        return f >= inicioMes && f <= finMes;
      });

      setRendicionSemanal(registrosSemana.length);
      setTotalMensual(registrosMes.length);

      const positivosSemana = registrosSemana.filter(
        i => (i.resultado_medida || i.resultado || '').toLowerCase() === 'positivo'
      ).length;
      setEfectividad(registrosSemana.length > 0 ? Math.round((positivosSemana / registrosSemana.length) * 100) : 100);

      const armasConteoMes = procesarDetallesExhaustivo(registrosMes, 'secuestro_armas');
      const vehiculosConteoMes = procesarDetallesExhaustivo(registrosMes, 'secuestro_vehiculos');
      const personasConteoMes = procesarDetallesExhaustivo(registrosMes, 'detenidos_aprehendidos');

      const armasConteoSem = procesarDetallesExhaustivo(registrosSemana, 'secuestro_armas');
      const vehiculosConteoSem = procesarDetallesExhaustivo(registrosSemana, 'secuestro_vehiculos');
      const personasConteoSem = procesarDetallesExhaustivo(registrosSemana, 'detenidos_aprehendidos');

      setDesgloseArmas({
        'Arma Corta': armasConteoMes['Arma Corta'] || 0,
        'Arma Larga': armasConteoMes['Arma Larga'] || 0,
        'Arma Blanca': armasConteoMes['Arma Blanca'] || 0,
        'Réplica': armasConteoMes['Réplica'] || 0,
      });

      setDesgloseVehiculos({
        'Auto': vehiculosConteoMes['Auto'] || 0,
        'Moto': vehiculosConteoMes['Moto'] || 0,
        'Camioneta': vehiculosConteoMes['Camioneta'] || 0,
        'Otros': vehiculosConteoMes['Otros'] || 0,
      });

      setDesglosePersonas({
        'Detenido': personasConteoMes['Detenido'] || 0,
        'Aprehendido': personasConteoMes['Aprehendido'] || 0,
      });

      const parseNum = (val: any) => { const n = parseInt(val, 10); return isNaN(n) ? 0 : n; };

      setArmasSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.armas_secuestradas), 0) || Object.values(armasConteoSem).reduce((a, b) => a + b, 0));
      setVehiculosSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.vehiculos_secuestrados), 0) || Object.values(vehiculosConteoSem).reduce((a, b) => a + b, 0));
      setDetenidosSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.detenidos_aprehendidos_cant), 0) || Object.values(personasConteoSem).reduce((a, b) => a + b, 0));

      setArmasMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.armas_secuestradas), 0) || Object.values(armasConteoMes).reduce((a, b) => a + b, 0));
      setVehiculosMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.vehiculos_secuestrados), 0) || Object.values(vehiculosConteoMes).reduce((a, b) => a + b, 0));
      setDetenidosMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.detenidos_aprehendidos_cant), 0) || Object.values(personasConteoMes).reduce((a, b) => a + b, 0));

      const semanas = [0, 1, 2, 3].map(offset => {
        const inicio = new Date(inicioSemana);
        inicio.setDate(inicio.getDate() - (offset * 7));
        const fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        fin.setHours(23, 59, 59, 999);
        
        const count = data.filter(item => {
          const f = parseFechaLocal(item.fecha_ejecucion || item.fecha || item.created_at);
          return f >= inicio && f <= fin;
        }).length;

        const label = offset === 0 ? 'Sem Actual' : `Sem -${offset}`;
        return { name: label, total: count };
      }).reverse();

      setDatosEvolucion(semanas);

      const conteoPartidos: Record<string, number> = {};
      data.forEach(item => {
        const p = item.partido || 'Sin Especificar';
        conteoPartidos[p] = (conteoPartidos[p] || 0) + 1;
      });

      setDatosPartidos(
        Object.entries(conteoPartidos)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
      );

      const conteoSupers: Record<string, number> = {};
      data.forEach(item => {
        const s = item.superintendencias?.nombre || item.superintendencia_nombre || 'Sin Especificar';
        conteoSupers[s] = (conteoSupers[s] || 0) + 1;
      });

      setDatosSuperintendencias(
        Object.entries(conteoSupers)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
      );

      const conteoEspecialidades: Record<string, number> = {};
      if (colaboracionesData.length > 0) {
        colaboracionesData.forEach((c: any) => {
          const esp = c.especialidad || 'Sin Especificar';
          conteoEspecialidades[esp] = (conteoEspecialidades[esp] || 0) + 1;
        });
      } else {
        data.forEach(item => {
          if (item.personal_colaboracion) {
            conteoEspecialidades[item.personal_colaboracion] = (conteoEspecialidades[item.personal_colaboracion] || 0) + 1;
          } else {
            conteoEspecialidades['No se Solicitó'] = (conteoEspecialidades['No se Solicitó'] || 0) + 1;
          }
        });
      }

      setDatosEspecialidades(
        Object.entries(conteoEspecialidades)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
      );

      setUltimaActualizacion(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    } catch (err) {
      console.error('Error cargando métricas:', err);
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Rendición Semanal</span>
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{rendicionSemanal}</div>
          <p className="text-[10px] text-slate-500 mt-1">Lunes a Domingo en curso</p>
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
            <p className="text-[10px] text-slate-500 mt-1">Esta semana ({armasMes} en el mes)</p>
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
            <p className="text-[10px] text-slate-500 mt-1">Esta semana ({vehiculosMes} en el mes)</p>
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
            <p className="text-[10px] text-slate-500 mt-1">Esta semana ({detenidosMes} en el mes)</p>
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
            <Shield className="w-4 h-4 text-emerald-400" /> Top 5 Partidos con Mayor Registros
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
            <ShieldCheck className="w-4 h-4 text-cyan-400" /> Distribución Operativa por Superintendencias
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
            <UserCheck className="w-4 h-4 text-purple-400" /> Top 5 de Especialidades / Colaboradores
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