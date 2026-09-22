'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Search, Edit3, Trash2, Lock, Upload, Eye, X, Shield, Calendar, MapPin, FileText, UserCheck, Crosshair, Car, CheckCircle2, Send } from 'lucide-react';
import { obtenerRangoSemanaRendida, obtenerValoresSecuestros } from '@/lib/allanamientos';
import * as XLSX from 'xlsx';

// Sincronización precisa con la hora oficial de Argentina (UTC-3)
function esVentanaHorariaValida(): boolean {
  const ahora = new Date();
  const opciones: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'narrow',
    hour: 'numeric',
    hour12: false
  };
  
  const formatter = new Intl.DateTimeFormat('es-AR', opciones);
  const partes = formatter.formatToParts(ahora);
  
  // Obtenemos día numérico en Argentina: 0 (Dom), 1 (Lun), 2 (Mar), 3 (Mié), etc.
  const formatterDia = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' });
  const diaStr = formatterDia.format(ahora);
  
  const diasMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dia = diasMap[diaStr] ?? ahora.getDay();
  
  const horaPart = partes.find(p => p.type === 'hour');
  const hora = horaPart ? parseInt(horaPart.value, 10) : ahora.getHours();

  // Lunes (1), Martes (2) todo el día, y Miércoles (3) hasta las 08:00 hs
  return dia === 1 || dia === 2 || (dia === 3 && hora < 8);
}

function SemaforoSuperintendencias({
  puedeGestionar,
}: {
  puedeGestionar: boolean;
}) {
  const [resumen, setResumen] = useState<any[]>([]);
  const [desplegado, setDesplegado] = useState(true);
  const [cargandoSupers, setCargandoSupers] = useState(true);
  const [accionGestion, setAccionGestion] = useState<{
    tipo: 'finalizar' | 'reabrir';
    superintendencia: any;
  } | null>(null);
  const [motivoGestion, setMotivoGestion] = useState('');
  const [referenciaGestion, setReferenciaGestion] = useState('');
  const [errorGestion, setErrorGestion] = useState<string | null>(null);
  const [procesandoGestion, setProcesandoGestion] = useState(false);

  useEffect(() => {
    obtenerSuperintendencias();
  }, []);

  async function obtenerSuperintendencias() {
    try {
      const { inicio } = obtenerRangoSemanaRendida();
      const { data, error } = await supabase.rpc('resumen_presentacion_allanamientos', {
        p_semana_inicio: inicio,
      });

      if (error) {
        throw error;
      }
      setResumen(data ?? []);
    } catch (err) {
      console.error('Error al cargar superintendencias:', err);
    } finally {
      setCargandoSupers(false);
    }
  }

  function abrirGestion(tipo: 'finalizar' | 'reabrir', superintendencia: any) {
    setMotivoGestion('');
    setReferenciaGestion('');
    setErrorGestion(null);
    setAccionGestion({ tipo, superintendencia });
  }

  async function confirmarGestion() {
    if (!accionGestion || !motivoGestion.trim()) {
      setErrorGestion('El motivo es obligatorio para conservar la trazabilidad.');
      return;
    }

    setProcesandoGestion(true);
    setErrorGestion(null);

    const parametros = {
      p_superintendencia_id: accionGestion.superintendencia.superintendencia_id,
      p_semana_inicio: obtenerRangoSemanaRendida().inicio,
      p_motivo: motivoGestion.trim(),
      p_referencia_documental: referenciaGestion.trim() || null,
    };

    const funcion = accionGestion.tipo === 'finalizar'
      ? 'finalizar_rendicion_allanamientos_gestion'
      : 'reabrir_rendicion_allanamientos_gestion';

    const { error } = await supabase.rpc(funcion, parametros);

    if (error) {
      setErrorGestion(error.message || 'No se pudo completar la operación.');
      setProcesandoGestion(false);
      return;
    }

    await obtenerSuperintendencias();
    setProcesandoGestion(false);
    setAccionGestion(null);
  }

  const rangoSemana = obtenerRangoSemanaRendida();
  const finalizadas = resumen.filter((s) => ['finalizado', 'bloqueado'].includes(s.estado)).length;
  const enCarga = resumen.filter((s) => s.estado === 'en_tramite').length;
  const pendientes = resumen.length - finalizadas - enCarga;

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
              Allanamientos ejecutados del {rangoSemana.inicio} al {rangoSemana.fin}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ✓ {finalizadas} Finalizadas
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              ◷ {enCarga} En carga
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
              ✕ {pendientes} Pendientes
            </span>
          </div>

          <button className="text-slate-400 hover:text-white transition text-xs font-bold px-2">
            {desplegado ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {desplegado && (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[32rem] overflow-y-auto custom-scrollbar">
          {resumen.map((sup) => {
            const cantidad = Number(sup.cantidad_allanamientos) || 0;
            const finalizada = ['finalizado', 'bloqueado'].includes(sup.estado);
            const tieneRegistros = cantidad > 0;
            const estadoClase = finalizada
              ? 'bg-slate-950/40 border-slate-800/80 hover:border-emerald-500/30'
              : tieneRegistros
                ? 'bg-amber-950/10 border-amber-900/30 hover:border-amber-500/40'
                : 'bg-red-950/10 border-red-900/30 hover:border-red-500/40';
            const estadoTexto = finalizada
              ? cantidad === 0
                ? 'Finalizada · Sin novedades (0)'
                : `Finalizada · ${cantidad} informados`
              : tieneRegistros
                ? `${cantidad} ${cantidad === 1 ? 'registro cargado' : 'registros cargados'} · Sin finalizar`
                : 'Pendiente de rendición';
            const puntoClase = finalizada
              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
              : tieneRegistros
                ? 'bg-amber-500 shadow-sm shadow-amber-500/50'
                : 'bg-red-500 animate-pulse shadow-sm shadow-red-500/50';

            return (
              <div 
                key={sup.superintendencia_id}
                className={`p-3 rounded-xl border flex items-start justify-between gap-3 min-h-24 transition-all ${estadoClase}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-200 whitespace-normal break-words leading-snug" title={sup.nombre}>
                    {sup.nombre}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {estadoTexto}
                  </p>
                  {puedeGestionar && (
                    <button
                      type="button"
                      onClick={() => abrirGestion(finalizada ? 'reabrir' : 'finalizar', sup)}
                      className={`mt-2 text-[10px] font-semibold disabled:opacity-50 ${
                        finalizada
                          ? 'text-amber-400 hover:text-amber-300'
                          : 'text-blue-400 hover:text-blue-300'
                      }`}
                    >
                      {finalizada ? 'Reabrir con respaldo' : 'Finalizar por gestión'}
                    </button>
                  )}
                </div>

                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${puntoClase}`} />
              </div>
            );
          })}
        </div>
      )}

      {accionGestion && (
        <div className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0"
            onClick={() => !procesandoGestion && setAccionGestion(null)}
          />

          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-slate-950/80 border-b border-slate-800 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {accionGestion.tipo === 'finalizar'
                    ? 'Finalizar rendición por gestión'
                    : 'Reabrir rendición'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {accionGestion.superintendencia.nombre}
                  {' · '}{rangoSemana.inicio} al {rangoSemana.fin}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAccionGestion(null)}
                disabled={procesandoGestion}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {accionGestion.tipo === 'finalizar' && Number(accionGestion.superintendencia.cantidad_allanamientos || 0) === 0 && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  Esta acción registrará una presentación formal sin novedades: 0 allanamientos.
                </div>
              )}

              {errorGestion && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  {errorGestion}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Motivo obligatorio
                </label>
                <textarea
                  value={motivoGestion}
                  onChange={(event) => setMotivoGestion(event.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder={accionGestion.tipo === 'finalizar'
                    ? 'Ej.: finalización solicitada por la autoridad responsable.'
                    : 'Ej.: corrección solicitada por la superintendencia.'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Referencia documental (opcional)
                </label>
                <input
                  value={referenciaGestion}
                  onChange={(event) => setReferenciaGestion(event.target.value)}
                  maxLength={500}
                  placeholder="Ej.: correo institucional 22/09/2026 · asunto..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-500 mt-1.5">
                  No pegues el cuerpo del correo ni datos sensibles; sólo fecha, asunto o número de nota.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 bg-slate-950/70 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAccionGestion(null)}
                disabled={procesandoGestion}
                className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarGestion}
                disabled={procesandoGestion || !motivoGestion.trim()}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-xl disabled:opacity-50 ${
                  accionGestion.tipo === 'finalizar'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {procesandoGestion
                  ? 'Procesando...'
                  : accionGestion.tipo === 'finalizar'
                    ? 'Confirmar finalización'
                    : 'Confirmar reapertura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalVistaPrevia({ item, onClose, puedeEditar, onEdit }: { item: any; onClose: () => void; puedeEditar: boolean; onEdit: () => void }) {
  if (!item) return null;
  const valores = obtenerValoresSecuestros(item);

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
              <p className="text-sm font-bold text-white mt-0.5">{valores.totalArmas}</p>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-center">
              <Car className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <p className="text-[9px] uppercase font-bold text-slate-500">Vehículos</p>
              <p className="text-sm font-bold text-white mt-0.5">{valores.totalVehiculos}</p>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-center">
              <UserCheck className="w-4 h-4 text-purple-400 mx-auto mb-1" />
              <p className="text-[9px] uppercase font-bold text-slate-500">Detenidos</p>
              <p className="text-sm font-bold text-white mt-0.5">{valores.totalPersonas}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DetalleGrupo
              titulo="Detalle de armas"
              items={[
                ['Arma corta', valores.corta],
                ['Arma larga', valores.larga],
                ['Arma blanca', valores.blanca],
                ['Réplica', valores.replica],
              ]}
            />
            <DetalleGrupo
              titulo="Detalle de vehículos"
              items={[
                ['Auto', valores.autos],
                ['Moto', valores.motos],
                ['Camioneta', valores.camionetas],
                ['Otros', valores.otrosVeh],
              ]}
            />
            <DetalleGrupo
              titulo="Detalle de personas"
              items={[
                ['Detenidos', valores.detenidos],
                ['Aprehendidos', valores.aprehendidos],
              ]}
            />
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

function DetalleGrupo({ titulo, items }: { titulo: string; items: Array<[string, number]> }) {
  const visibles = items.filter(([, cantidad]) => cantidad > 0);

  return (
    <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
      <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">{titulo}</p>
      {visibles.length === 0 ? (
        <p className="text-[10px] text-slate-600">Sin elementos informados</p>
      ) : (
        <div className="space-y-1.5">
          {visibles.map(([nombre, cantidad]) => (
            <div key={nombre} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-400">{nombre}</span>
              <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded-md">{cantidad}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      const rawRole = profile?.rol || profile?.role || '';
      const rol = String(rawRole).toLowerCase().trim();

      const esAdminOSupervisor = ['administrador', 'supervisor', 'admin', 'superadmin'].includes(rol);
      setPermitido(esAdminOSupervisor);
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

        // Carga eficiente única de superintendencias para mapeo instantáneo
        const { data: supers } = await supabase.from('superintendencias').select('id, nombre');
        const mapSupers = new Map(supers?.map(s => [s.nombre.toLowerCase().trim(), s.id]));

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('La sesión ya no es válida. Volvé a iniciar sesión.');

        const registrosParaInsertar = data.map(row => {
          const nombreSupExcel = String(row.superintendencia || row.Superintendencia || '').toLowerCase().trim();
          const superintendenciaId = mapSupers.get(nombreSupExcel) || null;
          const cantidadArmas = Math.max(0, Number(row.armas || row.armas_secuestradas || 0));
          const cantidadVehiculos = Math.max(0, Number(row.vehiculos || row.vehiculos_secuestrados || 0));
          const cantidadPersonas = Math.max(0, Number(row.personas || row.detenidos_aprehendidos_cant || 0));

          if (!superintendenciaId) {
            throw new Error(`Superintendencia inexistente en el archivo: ${nombreSupExcel || '(vacía)'}`);
          }

          return {
            operador_id: user.id,
            numero_ipp: row.numero_ipp || row.IPP || null,
            caratula: row.caratula || row.Caratula || null,
            ufi_juzgado: row.ufi_juzgado || row.UFI || 'Sin especificar',
            fecha_solicitud: row.fecha_solicitud || null,
            numero_parte_urgente: row.numero_parte_urgente || row.numero_pu || null,
            orden_servicio_propia: row.orden_servicio_propia || row.nro_orden_serv_propia || 'S/N',
            orden_servicio_cop: row.orden_servicio_cop || row.nro_orden_serv_cop || null,
            superintendencia_id: superintendenciaId, 
            partido: row.partido || null,
            departamental: row.departamental || 'Sin especificar',
            dependencia: row.dependencia || 'Sin especificar',
            lugar_presentacion: row.lugar_presentacion || row.dependencia || row.partido || 'Sin especificar',
            fecha_ejecucion: row.fecha_ejecucion || null,
            horario_ejecucion: row.horario_ejecucion || '00:00',
            personal_propio: Number(row.personal_propio || 1),
            resultado_medida: row.resultado_medida || 'Positivo',
            es_positivo: (row.resultado_medida || 'Positivo') === 'Positivo',
            objetivos: Number(row.objetivos || row.cantidad_objetivos || 1),
            resultado_secuestros: row.resultado_secuestros || 'Positivo',
            secuestro_armas: cantidadArmas > 0 ? [{ subtipo: 'Sin especificar', cantidad: cantidadArmas }] : [],
            secuestro_vehiculos: cantidadVehiculos > 0 ? [{ subtipo: 'Sin especificar', cantidad: cantidadVehiculos }] : [],
            detenidos_aprehendidos: cantidadPersonas > 0 ? [{ subtipo: 'Sin especificar', cantidad: cantidadPersonas }] : [],
            armas_secuestradas: cantidadArmas,
            vehiculos_secuestrados: cantidadVehiculos,
            detenidos_aprehendidos_cant: cantidadPersonas,
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
  const [esAdministradorOSupervisor, setEsAdministradorOSupervisor] = useState(false);
  const [rolUsuario, setRolUsuario] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [rendicionActual, setRendicionActual] = useState<any | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [itemSeleccionado, setItemSeleccionado] = useState<any | null>(null);

  const [paginaActual, setPaginaActual] = useState(1);
  const [registrosPorPagina, setRegistrosPorPagina] = useState(10);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [semaforoVersion, setSemaforoVersion] = useState(0);

  useEffect(() => {
    checkPeriodoYUsuario();
  }, []);

  async function checkPeriodoYUsuario() {
    setLoading(true);
    try {
      const estaEnVentana = esVentanaHorariaValida();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      const rawRole = profile?.rol || '';
      const rolNormalizado = String(rawRole).toLowerCase().trim();
      const rolNormalizadoCompatible = rolNormalizado === 'admin' ? 'administrador' : rolNormalizado;

      const esElevado = 
        rolNormalizado === 'supervisor' || 
        rolNormalizado === 'administrador' || 
        rolNormalizado === 'admin' || 
        rolNormalizado === 'superadmin' ||
        profile?.role_id === 2 || 
        profile?.role_id === 3;

      const tieneModulo = esElevado || profile?.modulos_permitidos?.includes('allanamientos');
      if (!profile || profile.activo === false || !tieneModulo) {
        router.replace('/select-app');
        return;
      }

      setEsAdministradorOSupervisor(esElevado);
      setRolUsuario(rolNormalizadoCompatible);
      setUsuarioId(session.user.id);
      setRendicionActual(null);

      let rendicion: any | null = null;
      if (rolNormalizadoCompatible === 'operador' && profile?.superintendencia_id) {
        const { inicio } = obtenerRangoSemanaRendida();
        const { data } = await supabase
          .from('rendiciones_allanamientos')
          .select('estado, semana_inicio, semana_fin, cantidad_allanamientos, finalizada_at')
          .eq('superintendencia_id', profile.superintendencia_id)
          .eq('semana_inicio', inicio)
          .maybeSingle();

        rendicion = data ?? null;
        setRendicionActual(rendicion);
      }

      const rendicionCerrada = ['finalizado', 'bloqueado'].includes(rendicion?.estado);
      setPuedeEditar(esElevado || (rolNormalizadoCompatible === 'operador' && estaEnVentana && !rendicionCerrada));
      setPaginaActual(1);
      await fetchData(rolNormalizadoCompatible, session.user.id, 1, registrosPorPagina, '');
    } catch (err) {
      console.error('Error al verificar permisos:', err);
      setAllanamientos([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchData(
    rol: string,
    userId: string,
    pagina = paginaActual,
    porPagina = registrosPorPagina,
    termino = busqueda,
  ) {
    setLoading(true);
    const { inicio, fin } = obtenerRangoSemanaRendida();
    const desde = (pagina - 1) * porPagina;
    const hasta = desde + porPagina - 1;

    let query = supabase
      .from('allanamientos')
      .select('*, superintendencias(nombre)', { count: 'exact' })
      .gte('fecha_ejecucion', inicio)
      .lte('fecha_ejecucion', fin)
      .order('fecha_ejecucion', { ascending: false })
      .order('created_at', { ascending: false })
      .range(desde, hasta);

    if (rol === 'operador') {
      query = query.eq('operador_id', userId);
    }

    const terminoSeguro = termino.trim().replace(/[(),]/g, ' ');
    if (terminoSeguro) {
      query = query.or(
        `numero_ipp.ilike.%${terminoSeguro}%,caratula.ilike.%${terminoSeguro}%,partido.ilike.%${terminoSeguro}%,dependencia.ilike.%${terminoSeguro}%`,
      );
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('Error al cargar la semana informada:', error);
      setAllanamientos([]);
      setTotalRegistros(0);
    } else {
      setAllanamientos(data ?? []);
      setTotalRegistros(count ?? 0);
    }
    setLoading(false);
  }

  async function ejecutarBusqueda() {
    if (!usuarioId || !rolUsuario) return;
    setPaginaActual(1);
    await fetchData(rolUsuario, usuarioId, 1, registrosPorPagina, busqueda);
  }

  async function cambiarPagina(nuevaPagina: number) {
    if (!usuarioId || nuevaPagina < 1) return;
    setPaginaActual(nuevaPagina);
    await fetchData(rolUsuario, usuarioId, nuevaPagina, registrosPorPagina, busqueda);
  }

  async function cambiarCantidadPorPagina(cantidad: number) {
    if (!usuarioId) return;
    setRegistrosPorPagina(cantidad);
    setPaginaActual(1);
    await fetchData(rolUsuario, usuarioId, 1, cantidad, busqueda);
  }

  const finalizarRendicion = async () => {
    const mensajeConfirmacion = totalRegistros === 0
      ? 'No hay allanamientos cargados. ¿Confirmás la presentación formal SIN NOVEDADES (0 registros)? Después no podrás agregar ni modificar registros.'
      : `¿Confirmás que la superintendencia terminó de cargar la semana con ${totalRegistros} ${totalRegistros === 1 ? 'registro' : 'registros'}? Después no podrás agregar ni modificar registros.`;

    if (!confirm(mensajeConfirmacion)) {
      return;
    }

    setFinalizando(true);
    const { error } = await supabase.rpc('finalizar_rendicion_allanamientos');

    if (error) {
      alert(error.message || 'No se pudo finalizar la rendición.');
      setFinalizando(false);
      return;
    }

    await checkPeriodoYUsuario();
    setFinalizando(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!esAdministradorOSupervisor) {
      alert('Sólo los Administradores o Supervisores pueden eliminar registros.');
      return;
    }
    if (!confirm('¿Está seguro de eliminar este registro de manera permanente?')) return;

    const { error } = await supabase.from('allanamientos').delete().eq('id', id);
    if (!error) {
      if (itemSeleccionado?.id === id) setItemSeleccionado(null);
      const paginaDestino = allanamientos.length === 1 && paginaActual > 1 ? paginaActual - 1 : paginaActual;
      setPaginaActual(paginaDestino);
      await fetchData(rolUsuario, usuarioId, paginaDestino, registrosPorPagina, busqueda);
      setSemaforoVersion((version) => version + 1);
    } else {
      alert('Error al intentar eliminar el registro.');
    }
  };

  const handleEditClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/allanamientos/editar/${id}`);
  };

  const esOperador = rolUsuario === 'operador';
  const rangoSemanaRendida = obtenerRangoSemanaRendida();
  const rendicionCerrada = ['finalizado', 'bloqueado'].includes(rendicionActual?.estado);

  const totalPaginas = Math.ceil(totalRegistros / registrosPorPagina);
  const indiceInicio = (paginaActual - 1) * registrosPorPagina;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
      
      {/* 1. ENCABEZADO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {esOperador ? 'Rendición semanal de Allanamientos' : 'Control de Allanamientos'}
          </h1>
          <p className="text-xs text-slate-400">
            Período informado: {rangoSemanaRendida.inicio} al {rangoSemanaRendida.fin}
            {!esOperador && ' · El historial se consulta desde Buscar'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!esOperador && <BotonImportarExcel onImportSuccess={() => checkPeriodoYUsuario()} />}

          {puedeEditar ? (
            <button
              onClick={() => router.push('/allanamientos/nuevo')}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nuevo Allanamiento
            </button>
          ) : !rendicionCerrada ? (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
              <Lock className="w-4 h-4" /> Fuera de período de carga (Lun 00hs a Mié 08hs)
            </div>
          ) : null}

          {esOperador && puedeEditar && (
            <button
              onClick={finalizarRendicion}
              disabled={finalizando}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition"
            >
              <Send className="w-4 h-4" />
              {finalizando ? 'Finalizando...' : 'Finalizar carga'}
            </button>
          )}

          {esOperador && rendicionCerrada && (
            <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4" /> Rendición finalizada
            </div>
          )}
        </div>
      </div>

      {/* 2. BUSCADOR Y TABLA */}
      <div className="space-y-4">
        {!esOperador && <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar en la semana por IPP, carátula, partido o dependencia..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ejecutarBusqueda();
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={ejecutarBusqueda}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition"
          >
            Buscar
          </button>
        </div>}

        {!rendicionCerrada && <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
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
                ) : allanamientos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No se encontraron allanamientos.
                    </td>
                  </tr>
                ) : (
                  allanamientos.map((item) => (
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
                            {esAdministradorOSupervisor && (
                              <button
                                onClick={(e) => handleDelete(e, item.id)}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
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

          {!loading && totalRegistros > 0 && (
            <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-3">
                <div>
                  Mostrando <span className="font-semibold text-white">{indiceInicio + 1}</span> a{' '}
                  <span className="font-semibold text-white">
                    {Math.min(indiceInicio + allanamientos.length, totalRegistros)}
                  </span>{' '}
                  de <span className="font-semibold text-white">{totalRegistros}</span> registros
                </div>

                <select
                  value={registrosPorPagina}
                  onChange={(e) => cambiarCantidadPorPagina(Number(e.target.value))}
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
                  onClick={() => cambiarPagina(paginaActual - 1)}
                  disabled={paginaActual === 1}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition"
                >
                  Anterior
                </button>
                <span className="text-slate-500 font-medium px-2">
                  Página {paginaActual} de {totalPaginas || 1}
                </span>
                <button
                  onClick={() => cambiarPagina(paginaActual + 1)}
                  disabled={paginaActual === totalPaginas || totalPaginas === 0}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>}

        {esOperador && rendicionCerrada && (
          <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <h2 className="text-base font-bold text-white">Rendición enviada correctamente</h2>
            <p className="text-xs text-slate-400 mt-1">
              Semana {rendicionActual?.semana_inicio} al {rendicionActual?.semana_fin}. Registros informados: {rendicionActual?.cantidad_allanamientos ?? 0}.
            </p>
          </div>
        )}
      </div>

      {/* 3. CONTROL SEMÁFORO GENERAL */}
      {!esOperador && (
        <SemaforoSuperintendencias
          key={semaforoVersion}
          puedeGestionar={esAdministradorOSupervisor}
        />
      )}

      {/* VISTA PREVIA INTERACTIVA */}
      <ModalVistaPrevia
        item={itemSeleccionado}
        onClose={() => setItemSeleccionado(null)}
        puedeEditar={puedeEditar}
        onEdit={() => {
          if (itemSeleccionado) router.push(`/allanamientos/editar/${itemSeleccionado.id}`);
        }}
      />

    </div>
  );
}
