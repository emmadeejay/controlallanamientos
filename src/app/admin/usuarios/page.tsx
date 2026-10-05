'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  Clock3,
  Edit,
  KeyRound,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import CopAdminHeader from '@/components/CopAdminHeader';
import {
  cambiarEstadoUsuarioAction,
  conciliarCambioEstadoUsuarioAction,
  conciliarResetClaveUsuarioAction,
  crearUsuarioAction,
  editarUsuarioAction,
  registrarTrasladoUsuarioAction,
  resetearPasswordAction,
  revalidarUsuarioAction,
} from '@/app/actions/usuarios';
import { supabase } from '@/lib/supabase';
import {
  diasHastaFecha,
  evaluarEstadoAcceso,
  type EstadoAcceso,
  type EstadoCuenta,
} from '@/lib/usuarios';

interface Superintendencia {
  id: string;
  nombre: string;
}

interface UsuarioProfile {
  id: string;
  nombre?: string;
  apellido?: string;
  nombre_completo?: string;
  dni: string;
  legajo: string;
  email: string;
  rol: string;
  superintendencia_id: string;
  superintendencias?: { id: string; nombre: string } | null;
  modulos_permitidos?: string[];
  activo?: boolean;
  estado_cuenta?: EstadoCuenta | null;
  vigencia_institucional_hasta?: string | null;
  revalidado_at?: string | null;
  referencia_vigencia?: string | null;
  requiere_cambio_clave?: boolean;
}

type FiltroEstado =
  | 'todos'
  | 'activos'
  | 'por_vencer'
  | 'vencidos'
  | 'pausados'
  | 'deshabilitados';

type ModalEstado = { usuario: UsuarioProfile; estado: EstadoCuenta } | null;

const MODULOS_DISPONIBLES = [
  { id: 'allanamientos', label: 'Allanamientos' },
];

const normalizarRol = (valor?: string) => String(valor || '').trim().toLowerCase();

function nombreUsuario(usuario: UsuarioProfile): string {
  return usuario.nombre
    ? `${usuario.nombre} ${usuario.apellido || ''}`.trim()
    : usuario.nombre_completo || 'Sin nombre';
}

function etiquetaEstado(estado: EstadoAcceso): string {
  const etiquetas: Record<EstadoAcceso, string> = {
    activo: 'ACTIVO',
    por_vencer: 'POR VENCER',
    validacion_vencida: 'VALIDACIÓN VENCIDA',
    pausado: 'PAUSADO',
    deshabilitado: 'BAJA OPERATIVA',
  };
  return etiquetas[estado];
}

function estiloEstado(estado: EstadoAcceso): string {
  const estilos: Record<EstadoAcceso, string> = {
    activo: 'bg-emerald-950/70 text-emerald-400 border-emerald-800/70',
    por_vencer: 'bg-amber-950/70 text-amber-400 border-amber-800/70',
    validacion_vencida: 'bg-orange-950/70 text-orange-400 border-orange-800/70',
    pausado: 'bg-slate-800 text-slate-300 border-slate-700',
    deshabilitado: 'bg-red-950/70 text-red-400 border-red-800/70',
  };
  return estilos[estado];
}

export default function GestionUsuariosAdminPage() {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [errorTraslado, setErrorTraslado] = useState<string | null>(null);
  const [superintendencias, setSuperintendencias] = useState<Superintendencia[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioProfile[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [usuarioACambiarPass, setUsuarioACambiarPass] = useState<UsuarioProfile | null>(null);
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioProfile | null>(null);
  const [usuarioRevalidando, setUsuarioRevalidando] = useState<UsuarioProfile | null>(null);
  const [usuarioTrasladando, setUsuarioTrasladando] = useState<UsuarioProfile | null>(null);
  const [modalEstado, setModalEstado] = useState<ModalEstado>(null);
  const [modalConciliacion, setModalConciliacion] = useState(false);
  const [errorConciliacion, setErrorConciliacion] = useState<string | null>(null);
  const [modalConciliacionClave, setModalConciliacionClave] = useState(false);
  const [modulosSeleccionados, setModulosSeleccionados] = useState<string[]>(['allanamientos']);
  const [miUsuarioId, setMiUsuarioId] = useState('');
  const [miEmail, setMiEmail] = useState('');
  const [miRolActual, setMiRolActual] = useState('operador');

  const recargarUsuarios = async (rol = miRolActual) => {
    let query = supabase.from('profiles').select('*, superintendencias(id, nombre)');
    if (normalizarRol(rol) === 'supervisor') {
      query = query.in('rol', ['auditor', 'operador', 'consulta']);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo actualizar la nómina de usuarios.' });
      return;
    }
    setUsuarios((data || []) as UsuarioProfile[]);
  };

  useEffect(() => {
    async function iniciar() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      setMiUsuarioId(session.user.id);
      setMiEmail(session.user.email || '');
      const { data: perfil } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', session.user.id)
        .maybeSingle();
      const rol = normalizarRol(perfil?.rol);
      if (rol) setMiRolActual(rol);

      const { data: dependencias } = await supabase
        .from('superintendencias')
        .select('id, nombre')
        .order('nombre', { ascending: true });
      setSuperintendencias((dependencias || []) as Superintendencia[]);
      await recargarUsuarios(rol || 'operador');
    }
    void iniciar();
  }, []);

  const rolNormalizado = normalizarRol(miRolActual);
  const puedeCrearUsuarios = rolNormalizado === 'administrador' || rolNormalizado === 'supervisor';

  const puedeGestionar = (objetivo: UsuarioProfile) => {
    const rolObjetivo = normalizarRol(objetivo.rol);
    if (rolNormalizado === 'administrador') return true;
    return rolNormalizado === 'supervisor' && ['auditor', 'operador', 'consulta'].includes(rolObjetivo);
  };

  const estadoDe = (usuario: UsuarioProfile) => evaluarEstadoAcceso(usuario);

  const conteos = useMemo(() => {
    const resultado = { activos: 0, por_vencer: 0, vencidos: 0, pausados: 0, deshabilitados: 0 };
    usuarios.forEach((usuario) => {
      const estado = estadoDe(usuario);
      if (estado === 'activo') resultado.activos += 1;
      if (estado === 'por_vencer') resultado.por_vencer += 1;
      if (estado === 'validacion_vencida') resultado.vencidos += 1;
      if (estado === 'pausado') resultado.pausados += 1;
      if (estado === 'deshabilitado') resultado.deshabilitados += 1;
    });
    return resultado;
  }, [usuarios]);

  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((usuario) => {
      const estado = estadoDe(usuario);
      if (filtroEstado === 'activos' && estado !== 'activo') return false;
      if (filtroEstado === 'por_vencer' && estado !== 'por_vencer') return false;
      if (filtroEstado === 'vencidos' && estado !== 'validacion_vencida') return false;
      if (filtroEstado === 'pausados' && estado !== 'pausado') return false;
      if (filtroEstado === 'deshabilitados' && estado !== 'deshabilitado') return false;

      const termino = busqueda.toLowerCase().trim();
      if (!termino) return true;
      const superintendencia = usuario.superintendencias?.nombre || superintendencias.find((item) => item.id === usuario.superintendencia_id)?.nombre || '';
      return [usuario.nombre, usuario.apellido, usuario.nombre_completo, usuario.dni, usuario.legajo, usuario.email, superintendencia]
        .some((valor) => String(valor || '').toLowerCase().includes(termino));
    });
  }, [usuarios, filtroEstado, busqueda, superintendencias]);

  const ejecutarFormulario = async (
    accion: (formData: FormData) => Promise<{ success: boolean; error?: string; temporaryPassword?: string; vigenciaHasta?: string }>,
    formData: FormData,
    textoExito: string,
    mostrarError?: (texto: string) => void,
  ) => {
    setCargando(true);
    setMensaje(null);
    try {
      const respuesta = await accion(formData);
      if (!respuesta.success) {
        const texto = respuesta.error || 'No se pudo completar la operación.';
        if (mostrarError) mostrarError(texto);
        else setMensaje({ tipo: 'error', texto });
        return false;
      }
      const clave = respuesta.temporaryPassword ? ` Clave temporal única: ${respuesta.temporaryPassword}` : '';
      const vigencia = respuesta.vigenciaHasta ? ` Vigencia institucional hasta ${respuesta.vigenciaHasta}.` : '';
      setMensaje({ tipo: 'ok', texto: `${textoExito}${vigencia}${clave}` });
      await recargarUsuarios();
      return true;
    } catch {
      const texto = 'Error inesperado al conectar con el servidor.';
      if (mostrarError) mostrarError(texto);
      else setMensaje({ tipo: 'error', texto });
      return false;
    } finally {
      setCargando(false);
    }
  };

  const handleCrear = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    formData.append('modulos_array', JSON.stringify(modulosSeleccionados));
    if (await ejecutarFormulario(crearUsuarioAction, formData, 'Usuario creado correctamente.')) {
      setModalAbierto(false);
      setModulosSeleccionados(['allanamientos']);
    }
  };

  const handleEditar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (!usuarioEditando) return;
    const formData = new FormData(evento.currentTarget);
    formData.append('id', usuarioEditando.id);
    formData.append('modulos_array', JSON.stringify(modulosSeleccionados));
    if (await ejecutarFormulario(editarUsuarioAction, formData, 'Usuario actualizado correctamente.')) setUsuarioEditando(null);
  };

  const handleRevalidar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    if (await ejecutarFormulario(revalidarUsuarioAction, formData, 'Validación institucional renovada.')) setUsuarioRevalidando(null);
  };

  const handleTraslado = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    setErrorTraslado(null);
    if (await ejecutarFormulario(registrarTrasladoUsuarioAction, formData, 'Traslado registrado sobre la misma identidad.', setErrorTraslado)) {
      setUsuarioTrasladando(null);
    }
  };

  const handleEstado = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    const texto = modalEstado?.estado === 'activo' ? 'Usuario reactivado.' : modalEstado?.estado === 'pausado' ? 'Usuario pausado.' : 'Usuario dado de baja operativa.';
    if (await ejecutarFormulario(cambiarEstadoUsuarioAction, formData, texto)) setModalEstado(null);
  };

  const handleConciliar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setErrorConciliacion(null);
    if (await ejecutarFormulario(
      conciliarCambioEstadoUsuarioAction,
      new FormData(evento.currentTarget),
      'Operación pendiente conciliada.',
      setErrorConciliacion,
    )) setModalConciliacion(false);
  };

  const handleConciliarClave = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setErrorConciliacion(null);
    if (await ejecutarFormulario(
      conciliarResetClaveUsuarioAction, new FormData(evento.currentTarget),
      'Restablecimiento conciliado.', setErrorConciliacion,
    )) setModalConciliacionClave(false);
  };

  const handleResetearPassword = async () => {
    if (!usuarioACambiarPass) return;
    setCargando(true);
    setMensaje(null);
    try {
      const respuesta = await resetearPasswordAction(usuarioACambiarPass.id);
      if (!respuesta.success) {
        setMensaje({ tipo: 'error', texto: respuesta.error });
        return;
      }
      setMensaje({ tipo: 'ok', texto: `Contraseña restablecida. Clave temporal única: ${respuesta.temporaryPassword}` });
      setUsuarioACambiarPass(null);
      await recargarUsuarios();
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo restablecer la contraseña.' });
    } finally {
      setCargando(false);
    }
  };

  const toggleModulo = (modulo: string) => {
    setModulosSeleccionados((actuales) => actuales.includes(modulo) ? actuales.filter((item) => item !== modulo) : [...actuales, modulo]);
  };

  const filtros: Array<{ id: FiltroEstado; texto: string; cantidad: number }> = [
    { id: 'todos', texto: 'Todos', cantidad: usuarios.length },
    { id: 'activos', texto: 'Activos', cantidad: conteos.activos },
    { id: 'por_vencer', texto: 'Por vencer', cantidad: conteos.por_vencer },
    { id: 'vencidos', texto: 'Vencidos', cantidad: conteos.vencidos },
    { id: 'pausados', texto: 'Pausados', cantidad: conteos.pausados },
    { id: 'deshabilitados', texto: 'Baja', cantidad: conteos.deshabilitados },
  ];

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    window.location.replace('/login');
  };

  return (
    <div className="cop-shell min-h-screen text-slate-100 flex flex-col selection:bg-[#806c3f] selection:text-white">
      <CopAdminHeader active="usuarios" email={miEmail} role={miRolActual} onLogout={cerrarSesion} />

      <main className="mx-auto w-full max-w-[1500px] flex-1 space-y-6 px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-5 border-b border-[#26364d] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="cop-module-index mt-1 hidden sm:block">02 / USUARIOS</span>
            <span className="hidden h-12 w-px bg-[#26364d] sm:block" />
            <div><p className="cop-kicker mb-2">Administración de identidades</p><h1 className="text-xl font-black uppercase tracking-[0.035em] text-white sm:text-2xl">Gestión de usuarios</h1><p className="mt-2 text-xs text-slate-400">Identidad única, destino, vigencia y trazabilidad institucional</p></div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {rolNormalizado === 'administrador' && <details className="group border border-[#33465f] bg-[#071426] text-xs text-slate-200">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 font-semibold hover:text-white">Herramientas administrativas <span aria-hidden="true" className="text-[#c4a35a] group-open:rotate-180">▾</span></summary>
              <div className="flex flex-col gap-2 border-t border-[#33465f] p-2">
                <button onClick={() => { setErrorConciliacion(null); setModalConciliacion(true); }} className="cop-action-secondary flex min-h-11 items-center gap-2 px-4"><ShieldAlert className="h-4 w-4" /> Conciliar operación</button>
                <button onClick={() => { setErrorConciliacion(null); setModalConciliacionClave(true); }} className="cop-action-secondary flex min-h-11 items-center gap-2 px-4"><KeyRound className="h-4 w-4" /> Conciliar clave</button>
              </div>
            </details>}
            {puedeCrearUsuarios && <button onClick={() => { setModulosSeleccionados(['allanamientos']); setModalAbierto(true); }} className="cop-action-primary flex items-center justify-center gap-2 px-4 py-2.5"><UserPlus className="w-4 h-4" /> Nuevo usuario</button>}
          </div>
        </section>

        {mensaje && (
          <div className={`p-4 rounded-xl text-xs border flex items-start gap-3 ${mensaje.tipo === 'ok' ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300' : 'bg-red-950/40 border-red-800/80 text-red-300'}`}>
            {mensaje.tipo === 'ok' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}<span className="break-all">{mensaje.texto}</span><button onClick={() => setMensaje(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        <section className="space-y-5 border border-[#33465f] bg-[#071426] p-6">
          <div className="flex flex-col xl:flex-row justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div className="flex flex-wrap gap-2">
              {filtros.map((filtro) => <button key={filtro.id} onClick={() => setFiltroEstado(filtro.id)} className={`border px-3 py-1.5 text-[11px] font-semibold ${filtroEstado === filtro.id ? 'border-[#c4a35a] bg-[#806c3f]/30 text-white' : 'border-[#33465f] bg-[#050e1c] text-slate-400 hover:text-white'}`}>{filtro.texto} ({filtro.cantidad})</button>)}
            </div>
            <div className="relative w-full xl:w-96"><Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" /><input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Nombre, DNI, legajo, correo o destino..." className="w-full border border-[#33465f] bg-[#050e1c] py-2.5 pl-10 pr-9 text-xs focus:border-[#c4a35a] focus:outline-none" />{busqueda && <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><X className="w-4 h-4" /></button>}</div>
          </div>

          {usuariosFiltrados.length === 0 ? <p className="text-xs text-slate-500 py-12 text-center">No se encontraron usuarios para este filtro.</p> : (
            <div className="space-y-3">
              {usuariosFiltrados.map((usuario) => {
                const estado = estadoDe(usuario);
                const dias = diasHastaFecha(usuario.vigencia_institucional_hasta);
                const destino = usuario.superintendencias?.nombre || superintendencias.find((item) => item.id === usuario.superintendencia_id)?.nombre || 'Sin superintendencia';
                const gestionable = puedeGestionar(usuario);
                const esPropio = miUsuarioId === usuario.id;
                const bloqueado = ['pausado', 'deshabilitado', 'validacion_vencida'].includes(estado);
                return (
                  <article key={usuario.id} className={`bg-[#131826] border rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 ${bloqueado ? 'border-slate-800 opacity-80' : 'border-slate-800/90 hover:border-slate-700'}`}>
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-sm uppercase">{nombreUsuario(usuario)}</h3>
                        <span className={`px-2 py-0.5 border rounded text-[9px] font-extrabold ${estiloEstado(estado)}`}>{etiquetaEstado(estado)}</span>
                        {usuario.requiere_cambio_clave && <span className="px-2 py-0.5 bg-amber-950/80 text-amber-400 border border-amber-800/60 rounded text-[9px] font-extrabold">CLAVE TEMPORAL</span>}
                        <span title={destino} className="inline-flex items-center gap-1.5 border border-[#806c3f] bg-[#050e1c] px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#c4a35a]"><Building2 className="w-3 h-3 shrink-0" /> {destino}</span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono">{usuario.email} · DNI {usuario.dni || 'N/A'} · Legajo {usuario.legajo || 'N/A'}</p>
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        <span className="px-2 py-1 rounded-md bg-[#090c13] border border-slate-800 text-slate-300 uppercase font-bold">{usuario.rol}</span>
                        {normalizarRol(usuario.rol) !== 'administrador' && <span className={`px-2 py-1 rounded-md border ${estado === 'validacion_vencida' ? 'border-orange-800/70 text-orange-400' : estado === 'por_vencer' ? 'border-amber-800/70 text-amber-400' : 'border-slate-800 text-slate-400'}`}>Vigencia: {usuario.vigencia_institucional_hasta || 'sin validar'}{dias !== null ? ` · ${dias >= 0 ? `${dias} días` : 'vencida'}` : ''}</span>}
                        {(usuario.modulos_permitidos || []).map((modulo) => <span key={modulo} className="border border-[#806c3f]/70 px-2 py-1 uppercase text-[#c4a35a]">{modulo}</span>)}
                      </div>
                    </div>
                    {gestionable && !esPropio && (
                      <div className="flex shrink-0 flex-wrap items-start gap-2">
                        <button type="button" onClick={() => { setUsuarioEditando(usuario); setModulosSeleccionados(usuario.modulos_permitidos || ['allanamientos']); }} className="cop-action-secondary flex min-h-11 items-center gap-2 px-3 text-xs"><Edit className="h-4 w-4" /> Editar</button>
                        <details className="group border border-[#33465f] bg-[#0b0e17] text-xs text-slate-200">
                          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 font-semibold hover:text-white">Gestionar <span aria-hidden="true" className="text-[#c4a35a] group-open:rotate-180">▾</span></summary>
                          <div className="grid gap-2 border-t border-[#33465f] p-2 sm:grid-cols-2 xl:grid-cols-1">
                            {(estado === 'activo' || estado === 'por_vencer' || estado === 'validacion_vencida') && <button type="button" onClick={() => setUsuarioACambiarPass(usuario)} className="flex min-h-11 items-center gap-2 border border-[#33465f] px-3 text-left hover:text-amber-400"><KeyRound className="h-4 w-4 shrink-0" /> Restablecer clave</button>}
                            {normalizarRol(usuario.rol) !== 'administrador' && (estado === 'activo' || estado === 'por_vencer' || estado === 'validacion_vencida') && <button type="button" onClick={() => setUsuarioRevalidando(usuario)} className="flex min-h-11 items-center gap-2 border border-[#33465f] px-3 text-left hover:text-[#c4a35a]"><RefreshCw className="h-4 w-4 shrink-0" /> Revalidar 60 días</button>}
                            {(estado === 'activo' || estado === 'por_vencer' || estado === 'validacion_vencida') && <button type="button" onClick={() => { setErrorTraslado(null); setUsuarioTrasladando(usuario); }} className="flex min-h-11 items-center gap-2 border border-[#33465f] px-3 text-left hover:text-[#c4a35a]"><ArrowRightLeft className="h-4 w-4 shrink-0" /> Registrar traslado</button>}
                            {(estado === 'activo' || estado === 'por_vencer' || estado === 'validacion_vencida') && <button type="button" onClick={() => setModalEstado({ usuario, estado: 'pausado' })} className="flex min-h-11 items-center gap-2 border border-[#33465f] px-3 text-left hover:text-amber-400"><PauseCircle className="h-4 w-4 shrink-0" /> Pausar identidad</button>}
                            {(estado === 'pausado' || estado === 'deshabilitado') && <button type="button" onClick={() => setModalEstado({ usuario, estado: 'activo' })} className="flex min-h-11 items-center gap-2 border border-[#33465f] px-3 text-left hover:text-emerald-300"><PlayCircle className="h-4 w-4 shrink-0" /> Reactivar identidad</button>}
                            {estado !== 'deshabilitado' && <button type="button" onClick={() => setModalEstado({ usuario, estado: 'deshabilitado' })} className="flex min-h-11 items-center gap-2 border border-[#33465f] px-3 text-left hover:text-red-400"><UserX className="h-4 w-4 shrink-0" /> Baja operativa</button>}
                          </div>
                        </details>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {modalAbierto && (
        <Modal titulo="Alta de nuevo usuario" icono={<UserPlus className="w-4 h-4 text-[#c4a35a]" />} cerrar={() => setModalAbierto(false)} ancho="max-w-2xl">
          <form onSubmit={handleCrear} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo label="Nombre"><input required name="nombre" className="input" /></Campo><Campo label="Apellido"><input required name="apellido" className="input" /></Campo><Campo label="DNI"><input required name="dni" inputMode="numeric" className="input" /></Campo><Campo label="Legajo"><input required name="legajo" className="input" /></Campo>
            </div>
            <Campo label="Correo electrónico (usuario)"><input required name="email" type="email" className="input" /></Campo>
            <Campo label="Superintendencia asignada"><SelectorSuperintendencia superintendencias={superintendencias} /></Campo>
            <Campo label="Rol de usuario"><select required name="rol" className="input" defaultValue="operador"><option value="operador">OPERADOR</option><option value="consulta">CONSULTA</option><option value="auditor">AUDITOR</option>{rolNormalizado === 'administrador' && <option value="supervisor">SUPERVISOR</option>}</select></Campo>
            <Campo label="Referencia documental del alta"><input required name="referencia_documental" placeholder="Expediente, nota o correo institucional" className="input" /></Campo>
            <Modulos seleccionados={modulosSeleccionados} alternar={toggleModulo} />
            <AccionesModal cargando={cargando} cancelar={() => setModalAbierto(false)} confirmar="Crear usuario" />
          </form>
        </Modal>
      )}

      {usuarioEditando && (
        <Modal titulo="Editar perfil" icono={<Edit className="w-4 h-4 text-[#c4a35a]" />} cerrar={() => setUsuarioEditando(null)} ancho="max-w-2xl">
          <form onSubmit={handleEditar} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Campo label="Nombre"><input required name="nombre" defaultValue={usuarioEditando.nombre || usuarioEditando.nombre_completo?.split(' ')[0]} className="input" /></Campo><Campo label="Apellido"><input required name="apellido" defaultValue={usuarioEditando.apellido || usuarioEditando.nombre_completo?.split(' ').slice(1).join(' ')} className="input" /></Campo><Campo label="DNI"><input required name="dni" defaultValue={usuarioEditando.dni} className="input" /></Campo><Campo label="Legajo"><input required name="legajo" defaultValue={usuarioEditando.legajo} className="input" /></Campo></div>
            <Campo label="Destino actual (usar Traslado para modificarlo)"><input type="hidden" name="superintendencia_id" value={usuarioEditando.superintendencia_id} /><input disabled value={usuarioEditando.superintendencias?.nombre || 'Superintendencia asignada'} className="input opacity-60" /></Campo>
            <Campo label="Rol"><select required name="rol" defaultValue={usuarioEditando.rol} className="input"><option value="operador">OPERADOR</option><option value="consulta">CONSULTA</option><option value="auditor">AUDITOR</option>{rolNormalizado === 'administrador' && <><option value="supervisor">SUPERVISOR</option><option value="administrador">ADMINISTRADOR</option></>}</select></Campo>
            <Modulos seleccionados={modulosSeleccionados} alternar={toggleModulo} />
            <AccionesModal cargando={cargando} cancelar={() => setUsuarioEditando(null)} confirmar="Guardar cambios" />
          </form>
        </Modal>
      )}

      {usuarioACambiarPass && (
        <Modal titulo="Restablecer contraseña" icono={<KeyRound className="w-4 h-4 text-amber-400" />} cerrar={() => setUsuarioACambiarPass(null)} ancho="max-w-md">
          <p className="text-sm text-slate-300">Se generará una clave temporal aleatoria para <strong>{nombreUsuario(usuarioACambiarPass)}</strong>. Deberá cambiarla al iniciar sesión.</p><p className="text-xs text-amber-400">La clave se mostrará una sola vez en el aviso superior.</p><AccionesModal cargando={cargando} cancelar={() => setUsuarioACambiarPass(null)} confirmar="Generar clave" onConfirmar={() => void handleResetearPassword()} />
        </Modal>
      )}

      {usuarioRevalidando && (
        <Modal titulo="Revalidar identidad por 60 días" icono={<Clock3 className="w-4 h-4 text-[#c4a35a]" />} cerrar={() => setUsuarioRevalidando(null)} ancho="max-w-md">
          <form onSubmit={handleRevalidar} className="space-y-4"><input type="hidden" name="id" value={usuarioRevalidando.id} /><p className="text-sm text-slate-300">Usuario: <strong>{nombreUsuario(usuarioRevalidando)}</strong></p><Campo label="Motivo"><input required name="motivo" defaultValue="Revalidación institucional periódica" className="input" /></Campo><Campo label="Referencia documental"><input required name="referencia_documental" placeholder="Nota o correo institucional" className="input" /></Campo><AccionesModal cargando={cargando} cancelar={() => setUsuarioRevalidando(null)} confirmar="Revalidar" /></form>
        </Modal>
      )}

      {usuarioTrasladando && (
        <Modal titulo="Registrar traslado" icono={<ArrowRightLeft className="w-4 h-4 text-[#c4a35a]" />} cerrar={() => { setErrorTraslado(null); setUsuarioTrasladando(null); }} ancho="max-w-md">
          <form onSubmit={handleTraslado} className="space-y-4">
            <input type="hidden" name="id" value={usuarioTrasladando.id} />
            {errorTraslado && <div role="alert" className="border border-red-800 bg-red-950/50 p-3 text-xs text-red-200">{errorTraslado}</div>}
            <p className="text-sm text-slate-300">Se conserva el mismo usuario, UUID y actividad histórica de <strong>{nombreUsuario(usuarioTrasladando)}</strong>.</p>
            <Campo label="Nuevo destino"><SelectorSuperintendencia superintendencias={superintendencias} excluir={usuarioTrasladando.superintendencia_id} /></Campo>
            <Campo label="Motivo del traslado"><input required name="motivo" className="input" /></Campo>
            <Campo label="Referencia documental"><input required name="referencia_documental" placeholder="Nota o correo institucional" className="input" /></Campo>
            <p className="text-xs text-amber-400">El traslado renueva la vigencia por 60 días y obliga a cambiar la contraseña.</p>
            <AccionesModal cargando={cargando} cancelar={() => { setErrorTraslado(null); setUsuarioTrasladando(null); }} confirmar="Registrar traslado" />
          </form>
        </Modal>
      )}

      {modalEstado && (
        <Modal titulo={modalEstado.estado === 'activo' ? 'Reactivar identidad' : modalEstado.estado === 'pausado' ? 'Pausa temporal' : 'Baja operativa'} icono={<ShieldAlert className="w-4 h-4 text-amber-400" />} cerrar={() => setModalEstado(null)} ancho="max-w-md">
          <form onSubmit={handleEstado} className="space-y-4"><input type="hidden" name="id" value={modalEstado.usuario.id} /><input type="hidden" name="estado" value={modalEstado.estado} /><p className="text-sm text-slate-300">Usuario: <strong>{nombreUsuario(modalEstado.usuario)}</strong></p><Campo label="Motivo"><textarea required name="motivo" rows={3} className="input resize-none" /></Campo><Campo label={`Referencia documental${modalEstado.estado === 'activo' ? '' : ' (opcional)'}`}><input required={modalEstado.estado === 'activo'} name="referencia_documental" placeholder="Nota o correo institucional" className="input" /></Campo><p className="text-xs text-slate-400">{modalEstado.estado === 'activo' ? 'Se generará una clave temporal, se renovará la vigencia por 60 días y se conservará todo el historial.' : modalEstado.estado === 'pausado' ? 'La pausa es reversible y bloquea el acceso de inmediato.' : 'La baja operativa conserva la identidad y su trazabilidad para una posible reactivación futura.'}</p><AccionesModal cargando={cargando} cancelar={() => setModalEstado(null)} confirmar={modalEstado.estado === 'activo' ? 'Reactivar' : modalEstado.estado === 'pausado' ? 'Pausar' : 'Dar de baja'} peligro={modalEstado.estado === 'deshabilitado'} /></form>
        </Modal>
      )}

      {modalConciliacion && (
        <Modal titulo="Conciliar operación de usuario" icono={<ShieldAlert className="w-4 h-4 text-amber-400" />} cerrar={() => setModalConciliacion(false)} ancho="max-w-md">
          <form onSubmit={handleConciliar} className="space-y-4">
            <p className="text-xs text-slate-300">Usá el código recibido cuando falló una pausa, baja o reactivación. Se volverá a verificar Auth y se confirmará el estado pendiente. Si es una reactivación, se generará otra clave temporal.</p>
            <Campo label="Código de operación"><input required name="operacion_id" autoComplete="off" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="input font-mono" /></Campo>
            {errorConciliacion && <p role="alert" className="border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">{errorConciliacion}</p>}
            <AccionesModal cargando={cargando} cancelar={() => { setErrorConciliacion(null); setModalConciliacion(false); }} confirmar="Conciliar" />
          </form>
        </Modal>
      )}

      {modalConciliacionClave && (
        <Modal titulo="Conciliar restablecimiento de clave" icono={<KeyRound className="w-4 h-4 text-amber-400" />} cerrar={() => setModalConciliacionClave(false)} ancho="max-w-md">
          <form onSubmit={handleConciliarClave} className="space-y-4">
            <p className="text-xs text-slate-300">Usá el código de la operación pendiente. Se generará otra clave temporal y la cuenta seguirá bloqueada hasta que Auth y Auditoría queden confirmados.</p>
            <Campo label="Código de operación"><input required name="operacion_id" autoComplete="off" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="input font-mono" /></Campo>
            {errorConciliacion && <p role="alert" className="border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">{errorConciliacion}</p>}
            <AccionesModal cargando={cargando} cancelar={() => { setErrorConciliacion(null); setModalConciliacionClave(false); }} confirmar="Conciliar clave" />
          </form>
        </Modal>
      )}

      <footer className="w-full border-t border-[#26364d] bg-[#071426] py-6 text-center"><p className="text-xs text-slate-400">Plataforma Integral de Gestión · Desarrollo: Emmanuel Machado</p></footer>
      <style jsx global>{`.input { width: 100%; padding: .7rem .875rem; background: #050e1c; border: 1px solid #33465f; border-radius: .25rem; color: white; font-size: .75rem; outline: none; } .input:focus { border-color: #c4a35a; }`}</style>
    </div>
  );
}

function Modal({ titulo, icono, cerrar, ancho, children }: { titulo: string; icono: React.ReactNode; cerrar: () => void; ancho: string; children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-y-auto"><div className={`bg-[#071426] border border-[#33465f] border-t-2 border-t-[#c4a35a] w-full ${ancho} max-h-[92vh] overflow-y-auto`}><div className="sticky top-0 z-10 bg-[#050e1c] p-4 border-b border-[#26364d] flex justify-between items-center px-6"><h2 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-2">{icono}{titulo}</h2><button type="button" onClick={cerrar} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button></div><div className="p-6 space-y-4">{children}</div></div></div>;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">{label}</span>{children}</label>;
}

function SelectorSuperintendencia({ superintendencias, excluir }: { superintendencias: Superintendencia[]; excluir?: string }) {
  return <select required name="superintendencia_id" defaultValue="" className="input"><option value="" disabled>Seleccionar superintendencia</option>{superintendencias.filter((item) => item.id !== excluir).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>;
}

function Modulos({ seleccionados, alternar }: { seleccionados: string[]; alternar: (id: string) => void }) {
  return <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Módulos autorizados</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{MODULOS_DISPONIBLES.map((modulo) => { const seleccionado = seleccionados.includes(modulo.id); return <button type="button" key={modulo.id} onClick={() => alternar(modulo.id)} className={`p-3 border flex items-center justify-between text-xs font-semibold ${seleccionado ? 'bg-[#806c3f]/25 border-[#c4a35a] text-white' : 'bg-[#050e1c] border-[#33465f] text-slate-500'}`}><span>{modulo.label}</span><span>{seleccionado ? '✓' : '○'}</span></button>; })}</div></div>;
}

function AccionesModal({ cargando, cancelar, confirmar, onConfirmar, peligro = false }: { cargando: boolean; cancelar: () => void; confirmar: string; onConfirmar?: () => void; peligro?: boolean }) {
  return <div className="flex justify-end gap-3 pt-4 border-t border-[#26364d]"><button type="button" onClick={cancelar} className="cop-action-secondary px-4 py-2">Cancelar</button><button type={onConfirmar ? 'button' : 'submit'} onClick={onConfirmar} disabled={cargando} className={`px-5 py-2.5 text-white font-bold text-xs uppercase disabled:opacity-50 ${peligro ? 'bg-red-700 hover:bg-red-600' : 'cop-action-primary'}`}>{cargando ? 'Procesando...' : confirmar}</button></div>;
}
