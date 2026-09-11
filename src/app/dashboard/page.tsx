'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Search, Edit3, Trash2, Lock, Upload, Eye, X, Shield, Calendar, MapPin, FileText, UserCheck, Crosshair, Car } from 'lucide-react';
import * as XLSX from 'xlsx';

// HELPER: Obtener el inicio de la semana actual (Lunes a las 00:00:00 hs)
function getInicioSemanaActual(): Date {
  const ahora = new Date();
  const diaSemana = ahora.getDay?.() ?? ahora.getDay();
  const diffLunes = (diaSemana === 0 ? -6 : 1) - diaSemana;

  const lunesActual = new Date(ahora);
  lunesActual.setDate(ahora.getDate() + diffLunes);
  lunesActual.setHours(0, 0, 0, 0);
  return lunesActual;
}

// COMPONENTE CONTROL SEMÁFORO
function SemaforoSuperintendencias({ allanamientos }: { allanamientos: any[] }) {
  const [superintendencias, setSuperintendencias] = useState<any[]>([]);
  const [desplegado, setDesplegado] = useState(true);
  const [cargandoSupers, setCargandoSupers] = useState(true);

  useEffect(() => {
    obtenerSuperintendencias();
  }, []);

  async function obtenerSuperintendencias() {
    try {
      const { data, error } = await supabase.from('superintendencias').select('id, nombre').order('nombre');
      if (!error && data) {
        setSuperintendencias(data);
      }
    } catch (err) {
      console.error('Error al cargar superintendencias:', err);
    } finally {
      setCargandoSupers(false);
    }
  }

  const inicioSemana = getInicioSemanaActual();

  const conteoPorSuper = allanamientos
    .filter(item => {
      const fechaRegistro = new Date(item.created_at || item.fecha_ejecucion);
      return fechaRegistro >= inicioSemana;
    })
    .reduce((acc: Record<string, number>, item) => {
      if (item.superintendencia_id) {
        acc[item.superintendencia_id] = (acc[item.superintendencia_id] || 0) + 1;
      }
      return acc;
    }, {});

  const activas = superintendencias.filter(s => (conteoPorSuper[s.id] || 0) > 0).length;
  const sinRegistros = superintendencias.length - activas;

  if (cargandoSupers) return null;

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md transition-all">
      <div 
        onClick={() => setDesplegado(!desplegado)}
        className="px-5 py-4 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between cursor-pointer hover:bg-slate-900/90 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Control de Presentación Semanal por Superintendencia
            </h3>
            <p className="text-[11px] text-slate-400">
              Estado de actividad en la semana en curso (Lunes a Domingo - Mínimo 1 registro requerido)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ✓ {activas} Activas
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
              ✕ {sinRegistros} Sin Registros
            </span>
          </div>

          <button className="text-slate-400 hover:text-white transition text-xs font-bold px-2">
            {desplegado ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {desplegado && (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto custom-scrollbar">
          {superintendencias.map((sup) => {
            const cantidad = conteoPorSuper[sup.id] || 0;
            const tieneRegistros = cantidad > 0;

            return (
              <div 
                key={sup.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                  tieneRegistros
                    ? 'bg-slate-950/40 border-slate-800/80 hover:border-emerald-500/30'
                    : 'bg-red-950/10 border-red-900/30 hover:border-red-500/40'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-200 truncate" title={sup.nombre}>
                    {sup.nombre}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {tieneRegistros ? `${cantidad} ${cantidad === 1 ? 'registro esta semana' : 'registros esta semana'}` : 'Sin datos esta semana'}
                  </p>
                </div>

                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${tieneRegistros ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-red-500 animate-pulse shadow-sm shadow-red-500/50'}`} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// COMPONENTE VISTA PREVIA RESPONSIVA (Modal / Bottom Sheet Mobile)
function ModalVistaPrevia({ item, onClose, puedeEditar, onEdit }: { item: any; onClose: () => void; puedeEditar: boolean; onEdit: () => void }) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl z-10 transition-all animate-in slide-in-from-bottom sm:zoom-in-95">
        
        <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              item.resultado_medida === 'Positivo' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {item.resultado_medida || 'Sin Resultado'}
            </span>
            <h3 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
              IPP: {item.numero_ipp}
            </h3>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          <div className="bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Carátula / Causa</p>
            <p className="text-white font-medium text-sm leading-snug">{item.caratula || 'Sin Carátula Registrada'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 flex items-start gap-3">
              <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Superintendencia</p>
                <p className="text-slate-200 font-semibold mt-0.5">{item.superintendencias?.nombre || item.superintendencia || 'N/A'}</p>
              </div>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 flex items-start gap-3">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Ubicación y Dependencia</p>
                <p className="text-slate-200 font-semibold mt-0.5">{item.partido || 'Sin Partido'}</p>
                <p className="text-[11px] text-slate-400">{item.dependencia || 'Sin especificación'}</p>
              </div>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 flex items-start gap-3">
              <Calendar className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Fecha y Hora Ejecución</p>
                <p className="text-slate-200 font-semibold mt-0.5">{item.fecha_ejecucion || 'N/A'}</p>
                <p className="text-[11px] text-slate-400">{item.horario_ejecucion ? `${item.horario_ejecucion} hs` : '--:-- hs'}</p>
              </div>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 flex items-start gap-3">
              <FileText className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">UFI / Juzgado</p>
                <p className="text-slate-200 font-semibold mt-0.5">{item.ufi_juzgado || 'No informado'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-center">
              <Crosshair className="w-4 h-4 text-rose-400 mx-auto mb-1" />
              <p className="text-[9px] uppercase font-bold text-slate-500">Armas</p>
              <p className="text-sm font-bold text-white mt-0.5">{item.armas_secuestradas || 0}</p>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-center">
              <Car className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <p className="text-[9px] uppercase font-bold text-slate-500">Vehículos</p>
              <p className="text-sm font-bold text-white mt-0.5">{item.vehiculos_secuestrados || 0}</p>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-center">
              <UserCheck className="w-4 h-4 text-purple-400 mx-auto mb-1" />
              <p className="text-[9px] uppercase font-bold text-slate-500">Detenidos</p>
              <p className="text-sm font-bold text-white mt-0.5">{item.detenidos_aprehendidos || 0}</p>
            </div>
          </div>

          {item.observaciones && (
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Observaciones / Notas</p>
              <p className="text-slate-300 text-[11px] leading-relaxed">{item.observaciones}</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
          >
            Cerrar
          </button>

          {puedeEditar && (
            <button
              onClick={onEdit}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-amber-600/20"
            >
              <Edit3 className="w-4 h-4" /> Editar Allanamiento
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// COMPONENTE IMPORTAR EXCEL
function BotonImportarExcel({ onImportSuccess }: { onImportSuccess?: () => void }) {
  const [permitido, setPermitido] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    verificarPermisosImportacion();
  }, []);

  async function verificarPermisosImportacion() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const userMetaRole = user.user_metadata?.role || user.app_metadata?.role;
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      const rawRole = userMetaRole || profile?.role || profile?.rol || '';
      const rol = String(rawRole).toLowerCase().trim();

      const esAdminOSupervisor = ['administrador', 'supervisor', 'admin', 'superadmin'].includes(rol);
      if (esAdminOSupervisor) {
        setPermitido(true);
        setLoading(false);
        return;
      }

      if (rol === 'operador' && profile?.superintendencia_id) {
        const { data: supData } = await supabase
          .from('superintendencias')
          .select('nombre')
          .eq('id', profile.superintendencia_id)
          .single();

        const superNombre = (supData?.nombre || '').toLowerCase();
        if (superNombre.includes('investigación judicial')) {
          setPermitido(true);
        }
      }
    } catch (err) {
      console.error('Error al verificar permisos de importación:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendo(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          alert('El archivo Excel está vacío.');
          setSubiendo(false);
          return;
        }

        const { data: supers } = await supabase.from('superintendencias').select('id, nombre');

        const registrosParaInsertar = data.map(row => {
          const nombreSupExcel = String(row.superintendencia || row.Superintendencia || '').trim().toLowerCase();
          const encontrada = supers?.find(s => s.nombre.toLowerCase() === nombreSupExcel);

          return {
            numero_ipp: row.numero_ipp || row.IPP || null,
            caratula: row.caratula || row.Caratula || null,
            ufi_juzgado: row.ufi_juzgado || row.UFI || null,
            fecha_solicitud: row.fecha_solicitud || null,
            numero_pu: row.numero_pu || null,
            nro_orden_serv_propia: row.nro_orden_serv_propia || null,
            nro_orden_serv_cop: row.nro_orden_serv_cop || null,
            superintendencia_id: encontrada ? encontrada.id : null, 
            partido: row.partido || null,
            departamental: row.departamental || null,
            dependencia: row.dependencia || null,
            fecha_ejecucion: row.fecha_ejecucion || null,
            horario_ejecucion: row.horario_ejecucion || null,
            personal_propio: row.personal_propio || 1,
            resultado_medida: row.resultado_medida || 'Positivo',
            cantidad_objetivos: row.cantidad_objetivos || 1,
            personal_colaboracion: row.colaboracion || null,
            resultado_secuestros: row.resultado_secuestros || 'Positivo',
            armas_secuestradas: row.armas || null,
            vehiculos_secuestrados: row.vehiculos || null,
            detenidos_aprehendidos: row.personas || null,
            observaciones: row.observaciones || 'Carga masiva Excel'
          };
        });

        const { error } = await supabase
          .from('allanamientos')
          .insert(registrosParaInsertar);

        if (error) throw error;

        alert(`¡Importación exitosa! Se cargaron ${registrosParaInsertar.length} registros.`);
        if (onImportSuccess) onImportSuccess();

      } catch (err: any) {
        console.error('Error al importar:', err);
        alert(`Error al procesar el archivo: ${err.message}`);
      } finally {
        setSubiendo(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  if (loading || !permitido) return null;

  return (
    <label className={`cursor-pointer px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 ${subiendo ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <Upload className="w-4 h-4" />
      <span>{subiendo ? 'Procesando...' : 'Importar Excel'}</span>
      <input 
        type="file" 
        accept=".xlsx, .xls, .csv" 
        onChange={handleFileUpload} 
        disabled={subiendo} 
        className="hidden" 
      />
    </label>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [allanamientos, setAllanamientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [itemSeleccionado, setItemSeleccionado] = useState<any | null>(null);

  // PAGINACIÓN
  const [paginaActual, setPaginaActual] = useState(1);
  const [registrosPorPagina, setRegistrosPorPagina] = useState(10);

  useEffect(() => {
    checkPeriodoYUsuario();
  }, []);

  function evaluarVentanaEdicion() {
    const ahora = new Date();
    const dia = ahora.getDay(); 
    const hora = ahora.getHours();
    return (dia === 1 && hora >= 8) || dia === 2 || (dia === 3 && hora < 8);
  }

  async function checkPeriodoYUsuario() {
    setLoading(true);
    try {
      const estaEnVentana = evaluarVentanaEdicion();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const userMetaRole = session.user.user_metadata?.role || session.user.app_metadata?.role;
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      const rawRole = userMetaRole || profile?.role || profile?.rol || '';
      const rolNormalizado = String(rawRole).toLowerCase().trim();

      const esElevado = 
        rolNormalizado === 'supervisor' || 
        rolNormalizado === 'admin' || 
        rolNormalizado === 'superadmin' ||
        profile?.role_id === 2 || 
        profile?.role_id === 3;

      setPuedeEditar(esElevado || estaEnVentana);
      await fetchData(esElevado, profile?.superintendencia_id);
    } catch (err) {
      console.error('Error al verificar permisos:', err);
      await fetchData(false);
    } finally {
      setLoading(false);
    }
  }

  async function fetchData(esElevado: boolean, superintendenciaId?: string) {
    let query = supabase
      .from('allanamientos')
      .select('*, superintendencias(nombre)')
      .order('created_at', { ascending: false });

    if (!esElevado && superintendenciaId) {
      query = query.eq('superintendencia_id', superintendenciaId);
    }

    const { data, error } = await query;
    if (!error && data) {
      setAllanamientos(data);
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!puedeEditar) return;
    if (!confirm('¿Está seguro de eliminar este registro?')) return;

    const { error } = await supabase.from('allanamientos').delete().eq('id', id);
    if (!error) {
      setAllanamientos(prev => prev.filter(item => item.id !== id));
      if (itemSeleccionado?.id === id) setItemSeleccionado(null);
    }
  };

  const handleEditClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/dashboard/editar/${id}`);
  };

  const filtrados = allanamientos.filter(item =>
    item.numero_ipp?.toLowerCase().includes(busqueda.toLowerCase()) ||
    item.caratula?.toLowerCase().includes(busqueda.toLowerCase()) ||
    item.partido?.toLowerCase().includes(busqueda.toLowerCase()) ||
    item.superintendencias?.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalPaginas = Math.ceil(filtrados.length / registrosPorPagina);
  const indiceInicio = (paginaActual - 1) * registrosPorPagina;
  const registrosPaginados = filtrados.slice(indiceInicio, indiceInicio + registrosPorPagina);

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, registrosPorPagina]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
      
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Control de Allanamientos
          </h1>
          <p className="text-xs text-slate-400">
            Haz clic en cualquier registro para ver su detalle rápido
          </p>
        </div>

        <div className="flex items-center gap-3">
          <BotonImportarExcel onImportSuccess={() => checkPeriodoYUsuario()} />

          {puedeEditar ? (
            <button
              onClick={() => router.push('/dashboard/nuevo')}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nuevo Allanamiento
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
              <Lock className="w-4 h-4" /> Fuera de período de carga (Lun 08hs a Mié 08hs)
            </div>
          )}
        </div>
      </div>

      {/* Control Semáforo General */}
      <SemaforoSuperintendencias allanamientos={allanamientos} />

      {/* Buscador */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por IPP, Carátula, Partido o Superintendencia..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Tabla con evento onClick en cada fila */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">IPP / Carátula</th>
                <th className="px-4 py-3">Superintendencia</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Ejecución</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Cargando registros...
                  </td>
                </tr>
              ) : registrosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No se encontraron allanamientos.
                  </td>
                </tr>
              ) : (
                registrosPaginados.map((item) => (
                  <tr 
                    key={item.id} 
                    onClick={() => setItemSeleccionado(item)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        {item.numero_ipp}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">{item.caratula}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-medium border border-slate-700/60">
                        {item.superintendencias?.nombre || item.superintendencia || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.partido}</div>
                      <div className="text-[10px] text-slate-500">{item.dependencia || 'Sin espec.'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.fecha_ejecucion}</div>
                      <div className="text-[10px] text-slate-500">{item.horario_ejecucion || '--:--'} hs</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        item.resultado_medida === 'Positivo' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {item.resultado_medida}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {puedeEditar ? (
                        <>
                          <button
                            onClick={(e) => handleEditClick(e, item.id)}
                            className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, item.id)}
                            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-600 text-[11px] italic flex items-center justify-end gap-1">
                          <Lock className="w-3 h-3" /> Solo lectura
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {!loading && filtrados.length > 0 && (
          <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <div>
                Mostrando <span className="font-semibold text-white">{indiceInicio + 1}</span> a{' '}
                <span className="font-semibold text-white">
                  {Math.min(indiceInicio + registrosPorPagina, filtrados.length)}
                </span>{' '}
                de <span className="font-semibold text-white">{filtrados.length}</span> registros
              </div>

              <select
                value={registrosPorPagina}
                onChange={(e) => setRegistrosPorPagina(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
              >
                <option value={10}>10 por pág.</option>
                <option value={25}>25 por pág.</option>
                <option value={50}>50 por pág.</option>
                <option value={100}>100 por pág.</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaginaActual((prev) => Math.max(prev - 1, 1))}
                disabled={paginaActual === 1}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition"
              >
                Anterior
              </button>
              <span className="text-slate-500 font-medium px-2">
                Página {paginaActual} de {totalPaginas || 1}
              </span>
              <button
                onClick={() => setPaginaActual((prev) => Math.min(prev + 1, totalPaginas))}
                disabled={paginaActual === totalPaginas || totalPaginas === 0}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* VISTA PREVIA INTERACTIVA */}
      <ModalVistaPrevia
        item={itemSeleccionado}
        onClose={() => setItemSeleccionado(null)}
        puedeEditar={puedeEditar}
        onEdit={() => {
          if (itemSeleccionado) router.push(`/dashboard/editar/${itemSeleccionado.id}`);
        }}
      />

    </div>
  );
}