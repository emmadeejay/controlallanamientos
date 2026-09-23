'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Search, Edit3, Trash2, Lock, Upload, Eye, X, Shield, Calendar, MapPin, FileText, UserCheck, Crosshair, Car, CheckCircle2, Send } from 'lucide-react';
import { obtenerRangoSemanaRendida, obtenerValoresSecuestros } from '@/lib/allanamientos';
import InformeSemanalControls from '@/components/InformeSemanalControls';

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
    <section className="cop-data-panel">
      <div className="cop-section-bar">
        <button
          type="button"
          onClick={() => setDesplegado(!desplegado)}
          className="flex min-w-0 items-center gap-3 text-left"
          aria-expanded={desplegado}
        >
          <span className="cop-module-index shrink-0">02 / CONTROL INTERNO</span>
          <span className="hidden h-8 w-px bg-[#26364d] sm:block" />
          <span className="min-w-0">
            <span className="block text-xs font-extrabold uppercase tracking-[0.05em] text-white sm:text-sm">
              Presentación semanal por superintendencia
            </span>
            <span className="mt-1 block text-[10px] text-slate-500 sm:text-[11px]">
              Período ejecutado: {rangoSemana.inicio} al {rangoSemana.fin}
            </span>
          </span>
        </button>

        <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-center xl:justify-end">
          <div className="cop-status-summary" aria-label="Resumen de presentaciones">
            <span className="text-emerald-400"><b className="text-sm">{finalizadas}</b> Finalizadas</span>
            <span className="text-amber-400"><b className="text-sm">{enCarga}</b> En carga</span>
            <span className="text-red-400"><b className="text-sm">{pendientes}</b> Pendientes</span>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <InformeSemanalControls
              semanaInicio={rangoSemana.inicio}
              resumen={resumen}
              puedeConsolidar={puedeGestionar}
            />
            <button
              type="button"
              onClick={() => setDesplegado(!desplegado)}
              className="h-10 border border-[#26364d] px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 transition hover:border-[#806c3f] hover:text-white"
              aria-label={desplegado ? 'Contraer control interno' : 'Desplegar control interno'}
            >
              {desplegado ? 'Contraer' : 'Desplegar'}
            </button>
          </div>
        </div>
      </div>

      {desplegado && (
        <div>
          <div className="cop-presentation-head">
            <span>Superintendencia</span>
            <span>Estado de presentación</span>
            <span>Registros</span>
            <span className="text-right">Gestión</span>
          </div>

          <div className="max-h-[34rem] overflow-y-auto custom-scrollbar">
            {resumen.map((sup) => {
              const cantidad = Number(sup.cantidad_allanamientos) || 0;
              const finalizada = ['finalizado', 'bloqueado'].includes(sup.estado);
              const tieneRegistros = cantidad > 0;
              const estadoTexto = finalizada
                ? cantidad === 0
                  ? 'Finalizada · Sin novedades'
                  : 'Finalizada'
                : tieneRegistros
                  ? 'Carga iniciada · Sin finalizar'
                  : 'Pendiente de rendición';
              const puntoClase = finalizada
                ? 'bg-emerald-500'
                : tieneRegistros
                  ? 'bg-amber-500'
                  : 'bg-red-500';
              const estadoColor = finalizada
                ? 'text-emerald-400'
                : tieneRegistros
                  ? 'text-amber-400'
                  : 'text-red-400';

              return (
                <div key={sup.superintendencia_id} className="cop-presentation-row">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`cop-status-dot mt-1 ${puntoClase}`} />
                    <p className="text-[11px] font-bold uppercase leading-snug tracking-[0.025em] text-slate-200">
                      {sup.nombre}
                    </p>
                  </div>

                  <p className={`text-[10px] font-bold uppercase tracking-[0.055em] ${estadoColor}`}>
                    {estadoTexto}
                  </p>

                  <p className="font-mono text-xs font-bold text-white">
                    {String(cantidad).padStart(2, '0')}
                  </p>

                  <div className="flex justify-end">
                    {puedeGestionar ? (
                      <button
                        type="button"
                        onClick={() => abrirGestion(finalizada ? 'reabrir' : 'finalizar', sup)}
                        className={`border-b pb-0.5 text-[10px] font-extrabold uppercase tracking-[0.055em] transition disabled:opacity-50 ${
                          finalizada
                            ? 'border-amber-700 text-amber-400 hover:text-amber-300'
                            : 'border-blue-800 text-blue-400 hover:text-blue-300'
                        }`}
                      >
                        {finalizada ? 'Reabrir con respaldo' : 'Finalizar por gestión'}
                      </button>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-slate-600">Consulta</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
    </section>
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

      // Defensa adicional al Proxy: Auditor y Consulta solo acceden a
      // Estadísticas y Buscar, nunca al tablero operativo ni al semáforo interno.
      if (['auditor', 'consulta'].includes(rolNormalizadoCompatible)) {
        router.replace('/allanamientos/metricas');
        return;
      }

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
    <div className="mx-auto max-w-[1500px] space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
      
      {/* 1. ENCABEZADO */}
      <section className="border-b border-[#26364d] pb-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="cop-module-index mt-1 hidden sm:block">01 / OPERACIONES</span>
            <span className="hidden h-12 w-px bg-[#26364d] sm:block" />
            <div>
              <p className="cop-kicker mb-2">Semana operativa</p>
              <h1 className="text-xl font-black uppercase tracking-[0.035em] text-white sm:text-2xl">
            {esOperador ? 'Rendición semanal de Allanamientos' : 'Control de Allanamientos'}
              </h1>
              <p className="mt-2 text-xs text-slate-400">
                Período informado: <span className="font-mono text-slate-200">{rangoSemanaRendida.inicio}</span> al{' '}
                <span className="font-mono text-slate-200">{rangoSemanaRendida.fin}</span>
                {!esOperador && ' · El historial se consulta desde Buscar'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
          {(rolUsuario === 'administrador' || rolUsuario === 'admin') && (
            <button
              onClick={() => router.push('/admin/importar-allanamientos')}
              className="cop-action-secondary cursor-pointer"
            >
              <Upload className="w-4 h-4" /> Carga histórica
            </button>
          )}

          {puedeEditar ? (
            <button
              onClick={() => router.push('/allanamientos/nuevo')}
              className="cop-action-primary cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nuevo Allanamiento
            </button>
          ) : !rendicionCerrada ? (
            <div className="flex min-h-10 items-center gap-2 border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-amber-400">
              <Lock className="w-4 h-4" /> Fuera de período de carga (Lun 00hs a Mié 08hs)
            </div>
          ) : null}

          {esOperador && puedeEditar && (
            <button
              onClick={finalizarRendicion}
              disabled={finalizando}
              className="cop-action-success disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {finalizando ? 'Finalizando...' : 'Finalizar carga'}
            </button>
          )}

          {esOperador && rendicionCerrada && (
            <div className="flex min-h-10 items-center gap-2 border border-emerald-800/60 bg-emerald-950/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
              <CheckCircle2 className="w-4 h-4" /> Rendición finalizada
            </div>
          )}
          </div>
        </div>
      </section>

      {/* 2. BUSCADOR Y TABLA */}
      <section className="space-y-3">
        {!esOperador && <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar en la semana por IPP, carátula, partido o dependencia..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ejecutarBusqueda();
              }}
              className="h-10 w-full rounded-[4px] border border-[#26364d] bg-[#071426] py-2 pl-10 pr-4 text-xs text-white outline-none placeholder:text-slate-600 focus:border-[#c4a35a]"
            />
          </div>
          <button
            type="button"
            onClick={ejecutarBusqueda}
            disabled={loading}
            className="cop-action-primary disabled:opacity-50"
          >
            Buscar
          </button>
        </div>}

        {!rendicionCerrada && <div className="cop-data-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-xs text-slate-300">
              <thead className="border-b border-[#26364d] bg-[#050e1c] text-[9px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">IPP / Carátula</th>
                  <th className="px-4 py-3">Superintendencia</th>
                  <th className="px-4 py-3">Ubicación</th>
                  <th className="px-4 py-3">Ejecución</th>
                  <th className="px-4 py-3">Resultado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17263a]">
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
                      className="cursor-pointer transition-colors hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          {item.numero_ipp}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{item.caratula}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block border-l-2 border-[#806c3f] pl-2 text-[10px] font-semibold uppercase leading-snug text-slate-300">
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
                        <span className={`inline-flex items-center gap-1 border-l-2 pl-2 text-[10px] font-bold uppercase tracking-wide ${
                          item.resultado_medida === 'Positivo' 
                            ? 'border-emerald-500 text-emerald-400'
                            : 'border-red-500 text-red-400'
                        }`}>
                          {item.resultado_medida}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {puedeEditar ? (
                          <>
                            <button
                              onClick={(e) => handleEditClick(e, item.id)}
                              className="border border-transparent p-1.5 text-amber-400 transition hover:border-amber-800/60 hover:bg-amber-500/10"
                              title="Editar"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {esAdministradorOSupervisor && (
                              <button
                                onClick={(e) => handleDelete(e, item.id)}
                                className="border border-transparent p-1.5 text-red-400 transition hover:border-red-800/60 hover:bg-red-500/10"
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
            <div className="flex flex-col items-center justify-between gap-3 border-t border-[#26364d] bg-[#050e1c] px-4 py-3 text-xs text-slate-400 sm:flex-row">
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
                  className="border border-[#26364d] bg-[#071426] px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-[#c4a35a]"
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
                  className="border border-[#26364d] bg-[#0b182a] px-3 py-1 text-white transition hover:border-[#806c3f] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-slate-500 font-medium px-2">
                  Página {paginaActual} de {totalPaginas || 1}
                </span>
                <button
                  onClick={() => cambiarPagina(paginaActual + 1)}
                  disabled={paginaActual === totalPaginas || totalPaginas === 0}
                  className="border border-[#26364d] bg-[#0b182a] px-3 py-1 text-white transition hover:border-[#806c3f] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>}

        {esOperador && rendicionCerrada && (
          <div className="cop-data-panel border-l-4 border-l-emerald-500 p-5">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
              <div>
                <p className="cop-kicker mb-1 text-emerald-400">Presentación confirmada</p>
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-white">Rendición enviada correctamente</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Semana {rendicionActual?.semana_inicio} al {rendicionActual?.semana_fin}. Registros informados: {rendicionActual?.cantidad_allanamientos ?? 0}.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. CONTROL SEMÁFORO GENERAL */}
      {esAdministradorOSupervisor && (
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
