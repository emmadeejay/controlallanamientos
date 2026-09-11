'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { Calendar, ShieldCheck, ShieldAlert, Car, Shield, UserCheck, TrendingUp } from 'lucide-react';

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

function getInicioSemanaActual(): Date {
  const ahora = new Date();
  const diaSemana = ahora.getDay();
  const diffLunes = (diaSemana === 0 ? -6 : 1) - diaSemana;

  const lunes = new Date(ahora);
  lunes.setDate(ahora.getDate() + diffLunes);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

function getInicioMesActual(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0);
}

// Extrae y cuenta subtipos buscando en cualquier columna o propiedad JSON/String
function procesarDetalles(registros: any[], tipoBuscado: 'armas' | 'vehiculos' | 'detenidos') {
  const conteo: Record<string, number> = {};

  registros.forEach(item => {
    Object.keys(item).forEach(key => {
      const valor = item[key];
      const keyLower = key.toLowerCase();

      const esCampoCoincidente = keyLower.includes(tipoBuscado) || 
        (tipoBuscado === 'detenidos' && (keyLower.includes('personas') || keyLower.includes('aprehendidos')));

      if (esCampoCoincidente && valor) {
        let lista = valor;
        
        if (typeof valor === 'string') {
          try { lista = JSON.parse(valor); } catch { lista = []; }
        }

        if (Array.isArray(lista)) {
          lista.forEach((element: any) => {
            if (element && typeof element === 'object') {
              const categoria = element.tipo || 
                                element.tipo_arma || 
                                element.tipo_vehiculo || 
                                element.tipo_persona || 
                                element.categoria || 
                                element.subtipo || 
                                element.especialidad;

              const cantidad = parseInt(element.cantidad || element.cant || 1, 10);
              
              if (categoria && typeof categoria === 'string') {
                conteo[categoria] = (conteo[categoria] || 0) + (isNaN(cantidad) ? 1 : cantidad);
              }
            } else if (typeof element === 'string') {
              conteo[element] = (conteo[element] || 0) + 1;
            }
          });
        }
      }
    });
  });

  return conteo;
}

export default function MetricasPage() {
  const [loading, setLoading] = useState(true);
  
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
    cargarMetricas();
  }, []);

  async function cargarMetricas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('allanamientos')
        .select('*, superintendencias(nombre)');

      if (error || !data) return;

      // Impresión de depuración para la consola (F12)
      console.log('Datos traídos de Supabase:', data);

      const inicioSemana = getInicioSemanaActual();
      const inicioMes = getInicioMesActual();

      const registrosSemana = data.filter(item => new Date(item.created_at || item.fecha_ejecucion) >= inicioSemana);
      const registrosMes = data.filter(item => new Date(item.created_at || item.fecha_ejecucion) >= inicioMes);

      setRendicionSemanal(registrosSemana.length);
      setTotalMensual(registrosMes.length);

      const positivosSemana = registrosSemana.filter(i => (i.resultado_medida || '').toLowerCase() === 'positivo').length;
      setEfectividad(registrosSemana.length > 0 ? Math.round((positivosSemana / registrosSemana.length) * 100) : 100);

      const parseNum = (val: any) => {
        const n = parseInt(val, 10);
        return isNaN(n) ? 0 : n;
      };

      setArmasSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.armas_secuestradas), 0));
      setVehiculosSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.vehiculos_secuestrados), 0));
      setDetenidosSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.detenidos_aprehendidos || curr.detenidos_aprehendidos_cant), 0));

      setArmasMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.armas_secuestradas), 0));
      setVehiculosMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.vehiculos_secuestrados), 0));
      setDetenidosMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.detenidos_aprehendidos || curr.detenidos_aprehendidos_cant), 0));

      // Procesamos el desglose sobre TODOS los registros (Mes/Total) para no perder datos si no concuerdan las fechas
      const fuenteProcesamiento = registrosSemana.length > 0 ? registrosSemana : registrosMes;

      const armasConteo = procesarDetalles(fuenteProcesamiento, 'armas');
      setDesgloseArmas({
        'Arma Corta': armasConteo['Arma Corta'] || armasConteo['Corta'] || 0,
        'Arma Larga': armasConteo['Arma Larga'] || armasConteo['Larga'] || 0,
        'Arma Blanca': armasConteo['Arma Blanca'] || armasConteo['Blanca'] || 0,
        'Réplica': armasConteo['Réplica'] || 0,
      });

      const vehiculosConteo = procesarDetalles(fuenteProcesamiento, 'vehiculos');
      setDesgloseVehiculos({
        'Auto': vehiculosConteo['Auto'] || 0,
        'Moto': vehiculosConteo['Moto'] || 0,
        'Camioneta': vehiculosConteo['Camioneta'] || 0,
        'Otros': vehiculosConteo['Otros'] || 0,
      });

      const personasConteo = procesarDetalles(fuenteProcesamiento, 'detenidos');
      setDesglosePersonas({
        'Detenido': personasConteo['Detenido'] || 0,
        'Aprehendido': personasConteo['Aprehendido'] || 0,
      });

      // Gráficos
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

      const conteoSupers: Record<string, number> = {};
      data.forEach(item => {
        const s = item.superintendencias?.nombre || item.superintendencia || 'Sin Especificar';
        conteoSupers[s] = (conteoSupers[s] || 0) + 1;
      });

      const arrSupers = Object.entries(conteoSupers)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);

      setDatosSuperintendencias(arrSupers);

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

      {/* TARJETAS DE RESULTADOS Y SECUESTROS CON DESGLOSE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Armas Secuestradas */}
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

        {/* Vehículos Secuestrados */}
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

        {/* Detenidos / Aprehendidos */}
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

      {/* SECCIÓN DE GRÁFICOS INFERIORES */}
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
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} 
                />
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
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} 
                />
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
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }} 
                />
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