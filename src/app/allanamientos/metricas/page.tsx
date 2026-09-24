'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { obtenerRangoSemanaRendida } from '@/lib/allanamientos';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { Calendar, ShieldCheck, ShieldAlert, Car, Shield, UserCheck, TrendingUp, Radio, Lock, BarChart3 } from 'lucide-react';

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
        <div className="mb-4 border border-red-800 bg-red-950/30 p-4">
          <Lock className="h-8 w-8 text-red-400" />
        </div>
        <p className="cop-kicker">Control de acceso</p>
        <h2 className="mb-2 mt-1 text-lg font-extrabold uppercase tracking-[0.04em] text-white">Acceso restringido</h2>
        <p className="text-xs text-slate-400 max-w-sm mb-6">
          Tu rol no tiene los permisos requeridos para visualizar el panel de métricas y estadísticas operativas.
        </p>
        <button
          onClick={() => router.push('/allanamientos')}
          className="cop-action-secondary"
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
    <main className="mx-auto max-w-7xl space-y-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <header className="border-b border-[#26364d] pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="cop-kicker">Control ejecutivo · OP-03</p>
            <h1 className="mt-1 text-xl font-extrabold uppercase tracking-[0.035em] text-white sm:text-2xl">Tablero de indicadores</h1>
            <p className="mt-1 text-xs text-slate-400">
              Semana informada: <span className="font-mono text-slate-200">{formatearFecha(semanaDesde)} al {formatearFecha(semanaHasta)}</span>
            </p>
          </div>
          <div className="flex flex-col gap-2 border-l-2 border-l-emerald-600 pl-3 sm:items-end">
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Monitoreo en línea
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Radio className="h-3.5 w-3.5 text-[#c4a35a]" />
              Actualización: <span className="font-mono text-slate-300">{ultimaActualizacion}</span>
            </div>
          </div>
        </div>
      </header>

      {errorCarga && (
        <div className="border border-red-800 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          {errorCarga}
        </div>
      )}

      <section className="overflow-hidden border border-[#26364d] bg-[#071426]/80">
        <div className="flex items-center gap-3 border-b border-[#26364d] bg-[#050e1c] px-4 py-3 sm:px-5">
          <span className="cop-form-section-index">01</span>
          <div>
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-white">Actividad general</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">Síntesis del período semanal y del acumulado mensual.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-[#26364d] md:grid-cols-3 md:divide-x md:divide-y-0">
          <IndicadorPrincipal icono={<Calendar className="h-4 w-4" />} etiqueta="Rendición semanal" valor={rendicionSemanal} detalle={`${formatearFecha(semanaDesde)} al ${formatearFecha(semanaHasta)}`} />
          <IndicadorPrincipal icono={<ShieldCheck className="h-4 w-4" />} etiqueta="Total mensual" valor={totalMensual} detalle="Acumulado del mes actual" />
          <IndicadorPrincipal icono={<TrendingUp className="h-4 w-4" />} etiqueta="Efectividad de las medidas" valor={`${efectividad}%`} detalle="Procedimientos con resultado positivo" />
        </div>
      </section>

      <section className="overflow-hidden border border-[#26364d] bg-[#071426]/80">
        <div className="flex items-center gap-3 border-b border-[#26364d] bg-[#050e1c] px-4 py-3 sm:px-5">
          <span className="cop-form-section-index">02</span>
          <div>
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-white">Resultados informados</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">Elementos y personas registrados durante la semana informada.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-[#26364d] md:grid-cols-3 md:divide-x md:divide-y-0">
          <ResultadoInformado
            codigo="R-01"
            icono={<ShieldAlert className="h-4 w-4" />}
            titulo="Armas secuestradas"
            semana={armasSemana}
            mes={armasMes}
            items={Object.entries(desgloseArmas)}
          />
          <ResultadoInformado
            codigo="R-02"
            icono={<Car className="h-4 w-4" />}
            titulo="Vehículos secuestrados"
            semana={vehiculosSemana}
            mes={vehiculosMes}
            items={Object.entries(desgloseVehiculos)}
          />
          <ResultadoInformado
            codigo="R-03"
            icono={<UserCheck className="h-4 w-4" />}
            titulo="Detenidos / aprehendidos"
            semana={detenidosSemana}
            mes={detenidosMes}
            items={Object.entries(desglosePersonas)}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3 border-b border-[#26364d] pb-3">
          <span className="cop-form-section-index">03</span>
          <div>
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-white">Lectura operativa</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">Evolución y principales concentraciones del período.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article className="border border-[#26364d] bg-[#071426]/80">
            <EncabezadoPanel codigo="G-01" icono={<Calendar className="h-4 w-4" />} titulo="Evolución semanal de procedimientos" subtitulo="Últimas cuatro semanas informadas" />
            <div className="h-72 p-4 sm:p-5">
              {datosEvolucion.length === 0 ? (
                <EstadoSinDatos />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosEvolucion} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#17263a" vertical={false} />
                    <XAxis dataKey="name" stroke="#718198" fontSize={10} tickLine={false} axisLine={{ stroke: '#26364d' }} />
                    <YAxis stroke="#718198" fontSize={10} allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(196, 163, 90, 0.05)' }} contentStyle={{ backgroundColor: '#050e1c', borderColor: '#806c3f', borderRadius: 0, fontSize: '11px' }} />
                    <Bar dataKey="total" fill="#c4a35a" name="Allanamientos" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <RankingInstitucional codigo="G-02" icono={<Shield className="h-4 w-4" />} titulo="Partidos con más registros" subtitulo="Top 5 · semana informada" datos={datosPartidos} unidad="registros" />
          <RankingInstitucional codigo="G-03" icono={<ShieldCheck className="h-4 w-4" />} titulo="Principales superintendencias" subtitulo="Top 5 · procedimientos informados" datos={datosSuperintendencias} unidad="procedimientos" />
          <RankingInstitucional codigo="G-04" icono={<BarChart3 className="h-4 w-4" />} titulo="Especialidades intervinientes" subtitulo="Top 5 · personal afectado" datos={datosEspecialidades} unidad="efectivos" />
        </div>
      </section>
    </main>
  );
}

function formatearFecha(valor: string) {
  if (!valor) return '--/--/----';
  const [anio, mes, dia] = valor.split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : valor;
}

function IndicadorPrincipal({ icono, etiqueta, valor, detalle }: { icono: ReactNode; etiqueta: string; valor: ReactNode; detalle: string }) {
  return (
    <div className="border-l-2 border-l-transparent px-5 py-5 transition hover:border-l-[#806c3f] hover:bg-white/[0.015]">
      <div className="flex items-center justify-between gap-3 text-slate-500">
        <span className="text-[9px] font-extrabold uppercase tracking-[0.1em]">{etiqueta}</span>
        <span className="text-[#c4a35a]">{icono}</span>
      </div>
      <p className="mt-3 font-mono text-3xl font-bold text-white sm:text-4xl">{valor}</p>
      <p className="mt-1 text-[10px] text-slate-500">{detalle}</p>
    </div>
  );
}

function ResultadoInformado({ codigo, icono, titulo, semana, mes, items }: { codigo: string; icono: ReactNode; titulo: string; semana: number; mes: number; items: Array<[string, number]> }) {
  return (
    <article className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#c4a35a]">{codigo}</p>
          <div className="mt-1 flex items-center gap-2 text-slate-300">
            <span className="text-slate-500">{icono}</span>
            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.06em]">{titulo}</h3>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold text-white">{semana}</p>
          <p className="text-[9px] text-slate-600">{mes} en el mes</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 border-t border-[#17263a] pt-3">
        {items.map(([nombre, cantidad]) => (
          <div key={nombre} className="flex items-center justify-between gap-2 border-b border-[#17263a] px-1 py-2 text-[10px] even:ml-3">
            <span className="text-slate-500">{nombre}</span>
            <span className="font-mono font-bold text-slate-200">{cantidad}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function EncabezadoPanel({ codigo, icono, titulo, subtitulo }: { codigo: string; icono: ReactNode; titulo: string; subtitulo: string }) {
  return (
    <header className="flex items-start gap-3 border-b border-[#26364d] bg-[#050e1c] px-4 py-3 sm:px-5">
      <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[#c4a35a]">{codigo}</span>
      <span className="mt-0.5 text-slate-500">{icono}</span>
      <div>
        <h3 className="text-[10px] font-extrabold uppercase tracking-[0.065em] text-white">{titulo}</h3>
        <p className="mt-0.5 text-[9px] text-slate-600">{subtitulo}</p>
      </div>
    </header>
  );
}

function RankingInstitucional({ codigo, icono, titulo, subtitulo, datos, unidad }: { codigo: string; icono: ReactNode; titulo: string; subtitulo: string; datos: any[]; unidad: string }) {
  const visibles = datos.slice(0, 5);
  const maximo = Math.max(1, ...visibles.map((item) => Number(item.total) || 0));

  return (
    <article className="border border-[#26364d] bg-[#071426]/80">
      <EncabezadoPanel codigo={codigo} icono={icono} titulo={titulo} subtitulo={subtitulo} />
      <div className="min-h-72 p-4 sm:p-5">
        {visibles.length === 0 ? (
          <EstadoSinDatos />
        ) : (
          <ol className="divide-y divide-[#17263a]">
            {visibles.map((item, indice) => {
              const total = Number(item.total) || 0;
              return (
                <li key={`${String(item.name)}-${indice}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 py-3">
                  <span className="font-mono text-[10px] font-bold text-[#c4a35a]">{String(indice + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <p className="break-words text-[10px] font-bold uppercase leading-relaxed text-slate-300">{String(item.name || 'Sin especificar')}</p>
                    <div className="mt-2 h-1 bg-[#17263a]"><div className="h-full bg-[#806c3f]" style={{ width: `${Math.max(3, (total / maximo) * 100)}%` }} /></div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-base font-bold text-white">{total}</p>
                    <p className="text-[8px] uppercase tracking-wide text-slate-600">{unidad}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </article>
  );
}

function EstadoSinDatos() {
  return <div className="flex h-full min-h-52 items-center justify-center border border-dashed border-[#26364d] px-4 text-center text-[10px] uppercase tracking-[0.06em] text-slate-600">Sin registros para el período informado</div>;
}
