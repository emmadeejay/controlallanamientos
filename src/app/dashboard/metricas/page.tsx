'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell 
} from 'recharts';
import { Calendar, ShieldCheck, ShieldAlert, Car, Shield, UserCheck, TrendingUp } from 'lucide-react';

// HELPER: Inicio de semana actual (Lunes 00:00:00 hs)
function getInicioSemanaActual(): Date {
  const ahora = new Date();
  const diaSemana = ahora.getDay(); // 0: Dom, 1: Lun, 2: Mar...
  const diffLunes = (diaSemana === 0 ? -6 : 1) - diaSemana;

  const lunes = new Date(ahora);
  lunes.setDate(ahora.getDate() + diffLunes);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

// HELPER: Inicio del mes actual (Día 1, 00:00:00 hs)
function getInicioMesActual(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0);
}

export default function MetricasPage() {
  const [loading, setLoading] = useState(true);
  
  // KPIs
  const [rendicionSemanal, setRendicionSemanal] = useState(0);
  const [totalMensual, setTotalMensual] = useState(0);
  const [efectividad, setEfectividad] = useState(100);
  
  // Secuestros filtrados por SEMANA ACTUAL
  const [armasSemana, setArmasSemana] = useState(0);
  const [vehiculosSemana, setVehiculosSemana] = useState(0);
  const [detenidosSemana, setDetenidosSemana] = useState(0);

  // Totales mensuales para referencia secundaria
  const [armasMes, setArmasMes] = useState(0);
  const [vehiculosMes, setVehiculosMes] = useState(0);
  const [detenidosMes, setDetenidosMes] = useState(0);

  // Datos para gráficos
  const [datosEvolucion, setDatosEvolucion] = useState<any[]>([]);
  const [datosPartidos, setDatosPartidos] = useState<any[]>([]);
  const [datosSuperintendencias, setDatosSuperintendencias] = useState<any[]>([]);
  const [datosEspecialidades, setDatosEspecialidades] = useState<any[]>([]);

  useEffect(() => {
    cargarMetricas();
  }, []);

  async function cargarMetricas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('allanamientos')
        .select('*, superintendencias(nombre)');

      if (error || !data) return;

      const inicioSemana = getInicioSemanaActual();
      const inicioMes = getInicioMesActual();

      // 1. Filtrar registros por períodos
      const registrosSemana = data.filter(item => new Date(item.created_at || item.fecha_ejecucion) >= inicioSemana);
      const registrosMes = data.filter(item => new Date(item.created_at || item.fecha_ejecucion) >= inicioMes);

      // 2. Cálculos KPIs principales
      setRendicionSemanal(registrosSemana.length);
      setTotalMensual(registrosMes.length);

      // Efectividad (positivos sobre el total de la semana)
      const positivosSemana = registrosSemana.filter(i => (i.resultado_medida || '').toLowerCase() === 'positivo').length;
      setEfectividad(registrosSemana.length > 0 ? Math.round((positivosSemana / registrosSemana.length) * 100) : 100);

      // 3. Totales de Secuestros - FILTRADOS POR LA SEMANA EN CURSO
      const parseNum = (val: any) => {
        const n = parseInt(val, 10);
        return isNaN(n) ? 0 : n;
      };

      setArmasSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.armas_secuestradas), 0));
      setVehiculosSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.vehiculos_secuestrados), 0));
      setDetenidosSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.detenidos_aprehendidos), 0));

      // Acumulados mensuales para texto secundario
      setArmasMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.armas_secuestradas), 0));
      setVehiculosMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.vehiculos_secuestrados), 0));
      setDetenidosMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.detenidos_aprehendidos), 0));

      // 4. Gráfico: Evolución Semanal (Últimas 4 semanas)
      const ahora = new Date();
      const semanas = [0, 1, 2, 3].map(offset => {
        const inicio = new Date(inicioSemana);
        inicio.setDate(inicio.getDate() - (offset * 7));
        const fin = new Date(inicio);
        fin.setDate(fin.getDate() + 7);
        
        const count = data.filter(item => {
          const f = new Date(item.created_at || item.fecha_ejecucion);
          return f >= inicio && f < fin;
        }).length;

        const label = offset === 0 ? 'Sem Actual' : `Sem -${offset}`;
        return { name: label, total: count };
      }).reverse();

      setDatosEvolucion(semanas);

      // 5. Gráfico: Top 5 Partidos con Mayor Registros
      const conteoPartidos: Record<string, number> = {};
      data.forEach(item => {
        const p = item.partido || 'Sin Especificar';
        conteoPartidos[p] = (conteoPartidos[p] || 0) + 1;
      });

      const topPartidos = Object.entries(conteoPartidos)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      setDatosPartidos(topPartidos);

      // 6. Gráfico: Distribución Operativa por Superintendencias (BARRAS)
      const conteoSupers: Record<string, number> = {};
      data.forEach(item => {
        const s = item.superintendencias?.nombre || item.superintendencia || 'Sin Especificar';
        conteoSupers[s] = (conteoSupers[s] || 0) + 1;
      });

      const arrSupers = Object.entries(conteoSupers)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);

      setDatosSuperintendencias(arrSupers);

      // 7. Gráfico: Top 5 Especialidades / Colaboradores
      const conteoEspecialidades: Record<string, number> = {};
      data.forEach(item => {
        const esp = item.personal_colaboracion || 'No se Solicitó';
        conteoEspecialidades[esp] = (conteoEspecialidades[esp] || 0) + 1;
      });

      const topEspecialidades = Object.entries(conteoEspecialidades)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      setDatosEspecialidades(topEspecialidades);

    } catch (err) {
      console.error('Error cargando métricas:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-xs">
        Cargando indicadores operativos...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
      
      {/* TARJETAS KPI SUPERIORES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Rendición Semanal */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Rendición Semanal</span>
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{rendicionSemanal}</div>
          <p className="text-[10px] text-slate-500 mt-1">Lunes a Domingo en curso</p>
        </div>

        {/* Total Mensual */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Mensual</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{totalMensual}</div>
          <p className="text-[10px] text-slate-500 mt-1">Acumulado del mes actual</p>
        </div>

        {/* Efectividad Medidas */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Efectividad Medidas</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{efectividad}%</div>
          <p className="text-[10px] text-slate-500 mt-1">Allanamientos con resultado positivo</p>
        </div>

      </div>

      {/* TARJETAS DE RESULTADOS Y SECUESTROS (FILTRADOS POR SEMANA) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Armas Secuestradas */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Armas Secuestradas</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{armasSemana}</div>
          <p className="text-[10px] text-slate-500 mt-1">Esta semana ({armasMes} en el mes)</p>
        </div>

        {/* Vehículos Secuestrados */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Vehículos Secuestrados</span>
            <Car className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{vehiculosSemana}</div>
          <p className="text-[10px] text-slate-500 mt-1">Esta semana ({vehiculosMes} en el mes)</p>
        </div>

        {/* Detenidos / Aprehendidos */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Detenidos / Aprehendidos</span>
            <UserCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{detenidosSemana}</div>
          <p className="text-[10px] text-slate-500 mt-1">Esta semana ({detenidosMes} en el mes)</p>
        </div>

      </div>

      {/* SECCIÓN DE GRÁFICOS INFERIORES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Gráfico 1: Evolución Semanal */}
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
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} 
                />
                <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} name="Allanamientos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Top 5 Partidos */}
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
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} 
                />
                <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} name="Registros" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 3: Distribución Operativa por Superintendencias (BARRAS REEMPLAZANDO DONA) */}
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
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} 
                />
                <Bar dataKey="total" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Procedimientos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 4: Top 5 Especialidades / Colaboradores */}
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
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} 
                />
                <Bar dataKey="total" fill="#a855f7" radius={[0, 4, 4, 0]} name="Intervenciones" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

    </div>
  );
}