'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { Calendar, ShieldCheck, ShieldAlert, Car, Shield, UserCheck, TrendingUp, Radio } from 'lucide-react';

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

// Convierte cadenas de fecha a Date local omitiendo desfasajes UTC
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

function procesarDetallesExhaustivo(registros: any[], tipoBuscado: 'arma' | 'vehiculo' | 'detenido') {
  const conteo: Record<string, number> = {};

  registros.forEach(item => {
    Object.keys(item).forEach(key => {
      const valor = item[key];
      if (!valor) return;

      const keyLower = key.toLowerCase();
      const esCoincidencia = keyLower.includes(tipoBuscado) || 
        (tipoBuscado === 'detenido' && (keyLower.includes('persona') || keyLower.includes('aprehendido')));

      if (esCoincidencia) {
        let lista = valor;

        if (typeof valor === 'string') {
          try {
            lista = JSON.parse(valor);
          } catch {
            const texto = valor.toLowerCase();
            if (texto.includes('corta')) conteo['Arma Corta'] = (conteo['Arma Corta'] || 0) + 1;
            else if (texto.includes('larga')) conteo['Arma Larga'] = (conteo['Arma Larga'] || 0) + 1;
            else if (texto.includes('blanca')) conteo['Arma Blanca'] = (conteo['Arma Blanca'] || 0) + 1;
            else if (texto.includes('replica') || texto.includes('réplica')) conteo['Réplica'] = (conteo['Réplica'] || 0) + 1;
            else if (texto.includes('auto')) conteo['Auto'] = (conteo['Auto'] || 0) + 1;
            else if (texto.includes('moto')) conteo['Moto'] = (conteo['Moto'] || 0) + 1;
            else if (texto.includes('camioneta')) conteo['Camioneta'] = (conteo['Camioneta'] || 0) + 1;
            else if (texto.includes('detenido')) conteo['Detenido'] = (conteo['Detenido'] || 0) + 1;
            else if (texto.includes('aprehendido')) conteo['Aprehendido'] = (conteo['Aprehendido'] || 0) + 1;
            return;
          }
        }

        if (Array.isArray(lista)) {
          lista.forEach((element: any) => {
            if (element && typeof element === 'object') {
              const cat = element.tipo || element.tipo_arma || element.tipo_vehiculo || element.categoria || element.subtipo || '';
              const cant = parseInt(element.cantidad || element.cant || 1, 10);
              if (cat) conteo[cat] = (conteo[cat] || 0) + (isNaN(cant) ? 1 : cant);
            } else if (typeof element === 'string') {
              conteo[element] = (conteo[element] || 0) + 1;
            }
          });
        } else if (typeof valor === 'number' && valor > 0) {
          if (keyLower.includes('corta')) conteo['Arma Corta'] = (conteo['Arma Corta'] || 0) + valor;
          if (keyLower.includes('larga')) conteo['Arma Larga'] = (conteo['Arma Larga'] || 0) + valor;
          if (keyLower.includes('blanca')) conteo['Arma Blanca'] = (conteo['Arma Blanca'] || 0) + valor;
          if (keyLower.includes('replica') || keyLower.includes('réplica')) conteo['Réplica'] = (conteo['Réplica'] || 0) + valor;
          if (keyLower.includes('auto')) conteo['Auto'] = (conteo['Auto'] || 0) + valor;
          if (keyLower.includes('moto')) conteo['Moto'] = (conteo['Moto'] || 0) + valor;
          if (keyLower.includes('camioneta')) conteo['Camioneta'] = (conteo['Camioneta'] || 0) + valor;
          if (keyLower.includes('detenido')) conteo['Detenido'] = (conteo['Detenido'] || 0) + valor;
          if (keyLower.includes('aprehendido')) conteo['Aprehendido'] = (conteo['Aprehendido'] || 0) + valor;
        }
      }
    });
  });

  return conteo;
}

export default function MetricasPage() {
  const [loading, setLoading] = useState(true);
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
    cargarMetricas();

    const canalRealtime = supabase
      .channel('auditoria-allanamientos-tv')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'allanamientos' },
        () => {
          cargarMetricas();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'allanamiento_colaboraciones' },
        () => {
          cargarMetricas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalRealtime);
    };
  }, []);

  async function cargarMetricas() {
    try {
      // 1. Consulta limpia a la tabla sin joins que disparen error 400
      const { data, error } = await supabase
        .from('allanamientos')
        .select('*');

      if (error) {
        console.error('Error al traer allanamientos:', error);
        return;
      }

      if (!data || data.length === 0) {
        setLoading(false);
        return;
      }

      // 2. Carga defensiva de colaboraciones
      let colaboracionesData: any[] = [];
      try {
        const { data: colabs } = await supabase.from('allanamiento_colaboraciones').select('*');
        if (colabs) colaboracionesData = colabs;
      } catch (e) {
        console.warn('Sin acceso a allanamiento_colaboraciones:', e);
      }

      const { inicio: inicioSemana, fin: finSemana } = getRangoSemanaActual();
      const { inicio: inicioMes, fin: finMes } = getRangoMesActual();

      // Filtrado por fechas locales
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

      // Desgloses de secuestros
      const armasConteoMes = procesarDetallesExhaustivo(registrosMes, 'arma');
      const vehiculosConteoMes = procesarDetallesExhaustivo(registrosMes, 'vehiculo');
      const personasConteoMes = procesarDetallesExhaustivo(registrosMes, 'detenido');

      const armasConteoSem = procesarDetallesExhaustivo(registrosSemana, 'arma');
      const vehiculosConteoSem = procesarDetallesExhaustivo(registrosSemana, 'vehiculo');
      const personasConteoSem = procesarDetallesExhaustivo(registrosSemana, 'detenido');

      setDesgloseArmas({
        'Arma Corta': armasConteoMes['Arma Corta'] || armasConteoMes['Corta'] || 0,
        'Arma Larga': armasConteoMes['Arma Larga'] || armasConteoMes['Larga'] || 0,
        'Arma Blanca': armasConteoMes['Arma Blanca'] || armasConteoMes['Blanca'] || 0,
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

      // Totales numéricos
      const parseNum = (val: any) => { const n = parseInt(val, 10); return isNaN(n) ? 0 : n; };

      setArmasSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.armas_secuestradas), 0) || Object.values(armasConteoSem).reduce((a, b) => a + b, 0));
      setVehiculosSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.vehiculos_secuestrados), 0) || Object.values(vehiculosConteoSem).reduce((a, b) => a + b, 0));
      setDetenidosSemana(registrosSemana.reduce((acc, curr) => acc + parseNum(curr.detenidos_aprehendidos), 0) || Object.values(personasConteoSem).reduce((a, b) => a + b, 0));

      setArmasMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.armas_secuestradas), 0) || Object.values(armasConteoMes).reduce((a, b) => a + b, 0));
      setVehiculosMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.vehiculos_secuestrados), 0) || Object.values(vehiculosConteoMes).reduce((a, b) => a + b, 0));
      setDetenidosMes(registrosMes.reduce((acc, curr) => acc + parseNum(curr.detenidos_aprehendidos), 0) || Object.values(personasConteoMes).reduce((a, b) => a + b, 0));

      // Evolución semanal (4 semanas)
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

      // Top 5 Partidos
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

      // Distribución por Superintendencias
      const conteoSupers: Record<string, number> = {};
      data.forEach(item => {
        const s = item.superintendencia || item.superintendencia_nombre || 'Sin Especificar';
        conteoSupers[s] = (conteoSupers[s] || 0) + 1;
      });

      setDatosSuperintendencias(
        Object.entries(conteoSupers)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
      );

      // Especialidades
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-xs">
        Cargando indicadores operativos para el centro de monitoreo...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
      
      {/* Barra de Monitoreo en Vivo */}
      <div className="flex justify-between items-center bg-slate-900/40 border border-slate-800/80 px-4 py-2 rounded-xl backdrop-blur-md">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          MONITOREO AUDITORÍA EN VIVO
        </div>
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-blue-400" />
          Última actualización: <span className="text-white font-mono">{ultimaActualizacion}</span>
        </div>
      </div>

      {/* Tarjetas Principales */}
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

      {/* Tarjetas de Secuestros */}
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

      {/* Gráficos */}
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