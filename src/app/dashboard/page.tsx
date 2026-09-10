'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Search, Edit3, Trash2, Lock, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

// COMPONENTE DE IMPORTACIÓN EXCEL CON TODOS LOS CAMPOS DEL FORMULARIO
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
        .single();

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
      .single();

    const rawRole = userMetaRole || profile?.role || profile?.rol || '';
    const rolNormalizado = String(rawRole).toLowerCase().trim();

    const esElevado = 
      rolNormalizado === 'supervisor' || 
      rolNormalizado === 'admin' || 
      rolNormalizado === 'superadmin' ||
      profile?.role_id === 2 || 
      profile?.role_id === 3;

    setPuedeEditar(esElevado || estaEnVentana);
    fetchData(esElevado, profile?.superintendencia_id);
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
    setLoading(false);
  }

  const handleDelete = async (id: string) => {
    if (!puedeEditar) return;
    if (!confirm('¿Está seguro de eliminar este registro?')) return;

    const { error } = await supabase.from('allanamientos').delete().eq('id', id);
    if (!error) {
      setAllanamientos(prev => prev.filter(item => item.id !== id));
    }
  };

  const filtrados = allanamientos.filter(item =>
    item.numero_ipp?.toLowerCase().includes(busqueda.toLowerCase()) ||
    item.caratula?.toLowerCase().includes(busqueda.toLowerCase()) ||
    item.partido?.toLowerCase().includes(busqueda.toLowerCase()) ||
    item.superintendencias?.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
      
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Control de Allanamientos
          </h1>
          <p className="text-xs text-slate-400">
            Módulo de gestión y seguimiento operativo
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

      {/* Tabla de Resultados */}
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
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No se encontraron allanamientos.
                  </td>
                </tr>
              ) : (
                filtrados.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{item.numero_ipp}</div>
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
                            onClick={() => router.push(`/dashboard/editar/${item.id}`)}
                            className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
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
      </div>
    </div>
  );
}