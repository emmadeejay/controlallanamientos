'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  Clock3,
  Edit,
  KeyRound,
  LogOut,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  User,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import {
  cambiarEstadoUsuarioAction,
  crearUsuarioAction,
  editarUsuarioAction,
  eliminarUsuarioAction,
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
import InstitutionalDialog from '@/components/InstitutionalDialog';

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
  { id: 'allanamientos', label: 'Control de Allanamientos' },
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
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [superintendencias, setSuperintendencias] = useState<Superintendencia[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioProfile[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [usuarioACambiarPass, setUsuarioACambiarPass] = useState<UsuarioProfile | null>(null);
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioProfile | null>(null);
  const [usuarioRevalidando, setUsuarioRevalidando] = useState<UsuarioProfile | null>(null);
  const [usuarioTrasladando, setUsuarioTrasladando] = useState<UsuarioProfile | null>(null);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<UsuarioProfile | null>(null);
  const [modalEstado, setModalEstado] = useState<ModalEstado>(null);
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
  ) => {
    setCargando(true);
    setMensaje(null);
    try {
      const respuesta = await accion(formData);
      if (!respuesta.success) {
        setMensaje({ tipo: 'error', texto: respuesta.error || 'No se pudo completar la operación.' });
        return false;
      }
      const clave = respuesta.temporaryPassword ? ` Clave temporal única: ${respuesta.temporaryPassword}` : '';
      const vigencia = respuesta.vigenciaHasta ? ` Vigencia institucional hasta ${respuesta.vigenciaHasta}.` : '';
      setMensaje({ tipo: 'ok', texto: `${textoExito}${vigencia}${clave}` });
      await recargarUsuarios();
      return true;
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error inesperado al conectar con el servidor.' });
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
    if (await ejecutarFormulario(registrarTrasladoUsuarioAction, formData, 'Traslado registrado sobre la misma identidad.')) setUsuarioTrasladando(null);
  };

  const handleEstado = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    const texto = modalEstado?.estado === 'activo' ? 'Usuario reactivado.' : modalEstado?.estado === 'pausado' ? 'Usuario pausado.' : 'Usuario dado de baja operativa.';
    if (await ejecutarFormulario(cambiarEstadoUsuarioAction, formData, texto)) setModalEstado(null);
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

  const handleEliminar = async () => {
    if (!usuarioAEliminar || cargando) return;
    setCargando(true);
    setMensaje(null);
    try {
      const respuesta = await eliminarUsuarioAction(usuarioAEliminar.id);
      if (respuesta.success) {
        setMensaje({ tipo: 'ok', texto: 'Usuario sin actividad eliminado.' });
        await recargarUsuarios();
      } else {
        setMensaje({ tipo: 'error', texto: respuesta.error });
      }
      setUsuarioAEliminar(null);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo completar la eliminación.' });
      setUsuarioAEliminar(null);
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
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col selection:bg-purple-600 selection:text-white">
      <header className="w-full border-b border-slate-800/80 bg-[#0c0f17]/90 px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src="/logo_cop.png" alt="Logo C.O.P" width={36} height={36} className="object-contain" priority />
          <div><h1 className="text-sm font-bold text-white tracking-wide uppercase">Sistema de Estadísticas COP</h1><p className="text-[10px] text-slate-400 uppercase tracking-widest">Gestión segura de identidades</p></div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 bg-[#131824] px-3 py-1.5 rounded-lg border border-slate-800"><User className="w-3.5 h-3.5 text-slate-400" /><span className="text-slate-300 font-mono text-[11px]">{miEmail}</span><span className="text-emerald-400 text-[10px] font-bold uppercase">{miRolActual}</span></div>
          <button onClick={cerrarSesion} className="flex items-center gap-1.5 bg-red-950/30 text-red-400 border border-red-900/40 px-3 py-1.5 rounded-lg"><LogOut className="w-3.5 h-3.5" /> Cerrar sesión</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1 space-y-6">
        <section className="bg-[#0f1420]/90 border border-slate-800/90 rounded-2xl p-6 shadow-2xl flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/select-app')} className="p-2.5 bg-[#161c2e] rounded-xl border border-slate-700/60 text-slate-300"><ArrowLeft className="w-4 h-4" /></button>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center"><Users className="w-5 h-5 text-purple-400" /></div>
            <div><h2 className="text-lg font-bold">Gestión Centralizada de Usuarios</h2><p className="text-xs text-slate-400">Identidad única, destino, vigencia y trazabilidad institucional</p></div>
          </div>
          {puedeCrearUsuarios && <button onClick={() => { setModulosSeleccionados(['allanamientos']); setModalAbierto(true); }} className="bg-purple-600 hover:bg-purple-500 px-4 py-2.5 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-2"><UserPlus className="w-4 h-4" /> Nuevo usuario</button>}
        </section>

        {mensaje && (
          <div className={`p-4 rounded-xl text-xs border flex items-start gap-3 ${mensaje.tipo === 'ok' ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300' : 'bg-red-950/40 border-red-800/80 text-red-300'}`}>
            {mensaje.tipo === 'ok' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}<span className="break-all">{mensaje.texto}</span><button onClick={() => setMensaje(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        <section className="bg-[#0f1420]/80 border border-slate-800/90 rounded-2xl p-6 shadow-2xl space-y-5">
          <div className="flex flex-col xl:flex-row justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div className="flex flex-wrap gap-2">
              {filtros.map((filtro) => <button key={filtro.id} onClick={() => setFiltroEstado(filtro.id)} className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold ${filtroEstado === filtro.id ? 'bg-purple-600 border-purple-500 text-white' : 'bg-[#080b12] border-slate-800 text-slate-400 hover:text-white'}`}>{filtro.texto} ({filtro.cantidad})</button>)}
            </div>
            <div className="relative w-full xl:w-96"><Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" /><input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Nombre, DNI, legajo, correo o destino..." className="w-full pl-10 pr-9 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-purple-500" />{busqueda && <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><X className="w-4 h-4" /></button>}</div>
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
                        <span title={destino} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-950/50 border border-indigo-800/50 text-indigo-300 rounded-md text-[10px] font-bold uppercase"><Building2 className="w-3 h-3 shrink-0" /> {destino}</span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono">{usuario.email} · DNI {usuario.dni || 'N/A'} · Legajo {usuario.legajo || 'N/A'}</p>
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        <span className="px-2 py-1 rounded-md bg-[#090c13] border border-slate-800 text-slate-300 uppercase font-bold">{usuario.rol}</span>
                        {normalizarRol(usuario.rol) !== 'administrador' && <span className={`px-2 py-1 rounded-md border ${estado === 'validacion_vencida' ? 'border-orange-800/70 text-orange-400' : estado === 'por_vencer' ? 'border-amber-800/70 text-amber-400' : 'border-slate-800 text-slate-400'}`}>Vigencia: {usuario.vigencia_institucional_hasta || 'sin validar'}{dias !== null ? ` · ${dias >= 0 ? `${dias} días` : 'vencida'}` : ''}</span>}
                        {(usuario.modulos_permitidos || []).map((modulo) => <span key={modulo} className="px-2 py-1 rounded-md border border-purple-900/50 text-purple-400 uppercase">{modulo}</span>)}
                      </div>
                    </div>
                    {gestionable && !esPropio && (
                      <div className="flex flex-wrap gap-1 bg-[#0b0e17] p-1 rounded-xl border border-slate-800 shrink-0">
                        <button title="Editar perfil" onClick={() => { setUsuarioEditando(usuario); setModulosSeleccionados(usuario.modulos_permitidos || ['allanamientos']); }} className="p-2 text-slate-400 hover:text-purple-400"><Edit className="w-4 h-4" /></button>
                        {(estado === 'activo' || estado === 'por_vencer' || estado === 'validacion_vencida') && <button title="Restablecer clave" onClick={() => setUsuarioACambiarPass(usuario)} className="p-2 text-slate-400 hover:text-amber-400"><KeyRound className="w-4 h-4" /></button>}
                        {normalizarRol(usuario.rol) !== 'administrador' && (estado === 'activo' || estado === 'por_vencer' || estado === 'validacion_vencida') && <button title="Revalidar por 60 días" onClick={() => setUsuarioRevalidando(usuario)} className="p-2 text-slate-400 hover:text-cyan-400"><RefreshCw className="w-4 h-4" /></button>}
                        {(estado === 'activo' || estado === 'por_vencer' || estado === 'validacion_vencida') && <button title="Registrar traslado" onClick={() => setUsuarioTrasladando(usuario)} className="p-2 text-slate-400 hover:text-blue-400"><ArrowRightLeft className="w-4 h-4" /></button>}
                        {(estado === 'activo' || estado === 'por_vencer' || estado === 'validacion_vencida') && <button title="Pausa temporal" onClick={() => setModalEstado({ usuario, estado: 'pausado' })} className="p-2 text-slate-400 hover:text-amber-400"><PauseCircle className="w-4 h-4" /></button>}
                        {(estado === 'pausado' || estado === 'deshabilitado') && <button title="Reactivar identidad" onClick={() => setModalEstado({ usuario, estado: 'activo' })} className="p-2 text-emerald-500 hover:text-emerald-300"><PlayCircle className="w-4 h-4" /></button>}
                        {estado !== 'deshabilitado' && <button title="Baja operativa" onClick={() => setModalEstado({ usuario, estado: 'deshabilitado' })} className="p-2 text-slate-400 hover:text-red-400"><UserX className="w-4 h-4" /></button>}
                        {rolNormalizado === 'administrador' && <button title="Eliminar sólo si no tiene actividad" onClick={() => setUsuarioAEliminar(usuario)} className="p-2 text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
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
        <Modal titulo="Alta de nuevo usuario" icono={<UserPlus className="w-4 h-4 text-purple-400" />} cerrar={() => setModalAbierto(false)} ancho="max-w-2xl">
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
        <Modal titulo="Editar perfil" icono={<Edit className="w-4 h-4 text-purple-400" />} cerrar={() => setUsuarioEditando(null)} ancho="max-w-2xl">
          <form onSubmit={handleEditar} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Campo label="Nombre"><input required name="nombre" defaultValue={usuarioEditando.nombre || usuarioEditando.nombre_completo?.split(' ')[0]} className="input" /></Campo><Campo label="Apellido"><input required name="apellido" defaultValue={usuarioEditando.apellido || usuarioEditando.nombre_completo?.split(' ').slice(1).join(' ')} className="input" /></Campo><Campo label="DNI"><input required name="dni" defaultValue={usuarioEditando.dni} className="input" /></Campo><Campo label="Legajo"><input required name="legajo" defaultValue={usuarioEditando.legajo} className="input" /></Campo></div>
            <Campo label="Destino actual (usar Traslado para modificarlo)"><input type="hidden" name="superintendencia_id" value={usuarioEditando.superintendencia_id} /><input disabled value={usuarioEditando.superintendencias?.nombre || 'Superintendencia asignada'} className="input opacity-60" /></Campo>
            <Campo label="Rol"><select required name="rol" defaultValue={usuarioEditando.rol} className="input"><option value="operador">OPERADOR</option><option value="consulta">CONSULTA</option><option value="auditor">AUDITOR</option>{rolNormalizado === 'administrador' && <option value="supervisor">SUPERVISOR</option>}</select></Campo>
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
        <Modal titulo="Revalidar identidad por 60 días" icono={<Clock3 className="w-4 h-4 text-cyan-400" />} cerrar={() => setUsuarioRevalidando(null)} ancho="max-w-md">
          <form onSubmit={handleRevalidar} className="space-y-4"><input type="hidden" name="id" value={usuarioRevalidando.id} /><p className="text-sm text-slate-300">Usuario: <strong>{nombreUsuario(usuarioRevalidando)}</strong></p><Campo label="Motivo"><input required name="motivo" defaultValue="Revalidación institucional periódica" className="input" /></Campo><Campo label="Referencia documental"><input required name="referencia_documental" placeholder="Nota o correo institucional" className="input" /></Campo><AccionesModal cargando={cargando} cancelar={() => setUsuarioRevalidando(null)} confirmar="Revalidar" /></form>
        </Modal>
      )}

      {usuarioTrasladando && (
        <Modal titulo="Registrar traslado" icono={<ArrowRightLeft className="w-4 h-4 text-blue-400" />} cerrar={() => setUsuarioTrasladando(null)} ancho="max-w-md">
          <form onSubmit={handleTraslado} className="space-y-4"><input type="hidden" name="id" value={usuarioTrasladando.id} /><p className="text-sm text-slate-300">Se conserva el mismo usuario, UUID y actividad histórica de <strong>{nombreUsuario(usuarioTrasladando)}</strong>.</p><Campo label="Nuevo destino"><SelectorSuperintendencia superintendencias={superintendencias} excluir={usuarioTrasladando.superintendencia_id} /></Campo><Campo label="Motivo del traslado"><input required name="motivo" className="input" /></Campo><Campo label="Referencia documental"><input required name="referencia_documental" placeholder="Nota o correo institucional" className="input" /></Campo><p className="text-xs text-amber-400">El traslado renueva la vigencia por 60 días y obliga a cambiar la contraseña.</p><AccionesModal cargando={cargando} cancelar={() => setUsuarioTrasladando(null)} confirmar="Registrar traslado" /></form>
        </Modal>
      )}

      {modalEstado && (
        <Modal titulo={modalEstado.estado === 'activo' ? 'Reactivar identidad' : modalEstado.estado === 'pausado' ? 'Pausa temporal' : 'Baja operativa'} icono={<ShieldAlert className="w-4 h-4 text-amber-400" />} cerrar={() => setModalEstado(null)} ancho="max-w-md">
          <form onSubmit={handleEstado} className="space-y-4"><input type="hidden" name="id" value={modalEstado.usuario.id} /><input type="hidden" name="estado" value={modalEstado.estado} /><p className="text-sm text-slate-300">Usuario: <strong>{nombreUsuario(modalEstado.usuario)}</strong></p><Campo label="Motivo"><textarea required name="motivo" rows={3} className="input resize-none" /></Campo><Campo label={`Referencia documental${modalEstado.estado === 'activo' ? '' : ' (opcional)'}`}><input required={modalEstado.estado === 'activo'} name="referencia_documental" placeholder="Nota o correo institucional" className="input" /></Campo><p className="text-xs text-slate-400">{modalEstado.estado === 'activo' ? 'Se generará una clave temporal, se renovará la vigencia por 60 días y se conservará todo el historial.' : modalEstado.estado === 'pausado' ? 'La pausa es reversible y bloquea el acceso de inmediato.' : 'La baja operativa conserva la identidad y su trazabilidad para una posible reactivación futura.'}</p><AccionesModal cargando={cargando} cancelar={() => setModalEstado(null)} confirmar={modalEstado.estado === 'activo' ? 'Reactivar' : modalEstado.estado === 'pausado' ? 'Pausar' : 'Dar de baja'} peligro={modalEstado.estado === 'deshabilitado'} /></form>
        </Modal>
      )}

      <InstitutionalDialog
        open={Boolean(usuarioAEliminar)}
        title="Eliminar identidad sin actividad"
        description={usuarioAEliminar
          ? `Se intentará eliminar definitivamente a ${nombreUsuario(usuarioAEliminar)}. La operación sólo será autorizada si la identidad no posee actividad histórica asociada.`
          : undefined}
        tone="danger"
        confirmLabel="Eliminar usuario"
        loading={cargando}
        onCancel={() => setUsuarioAEliminar(null)}
        onConfirm={handleEliminar}
      >
        <div className="border-l-2 border-red-700 bg-[#050e1c] px-3 py-2 text-xs text-slate-400">
          Si existe trazabilidad previa, el servidor rechazará la eliminación y deberá utilizarse la baja operativa.
        </div>
      </InstitutionalDialog>

      <footer className="w-full border-t border-slate-800/80 bg-[#0c0f17]/90 py-6 text-center"><p className="text-xs text-slate-400">Desarrollado por <span className="text-blue-400 font-semibold">Emmanuel Machado</span></p></footer>
      <style jsx global>{`.input { width: 100%; padding: .7rem .875rem; background: #090c13; border: 1px solid #1e293b; border-radius: .75rem; color: white; font-size: .75rem; outline: none; } .input:focus { border-color: #a855f7; }`}</style>
    </div>
  );
}

function Modal({ titulo, icono, cerrar, ancho, children }: { titulo: string; icono: React.ReactNode; cerrar: () => void; ancho: string; children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"><div className={`bg-[#0f1420] border border-slate-800 rounded-2xl shadow-2xl w-full ${ancho} max-h-[92vh] overflow-y-auto`}><div className="sticky top-0 z-10 bg-[#090c13] p-4 border-b border-slate-800 flex justify-between items-center px-6"><h2 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-2">{icono}{titulo}</h2><button type="button" onClick={cerrar} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button></div><div className="p-6 space-y-4">{children}</div></div></div>;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">{label}</span>{children}</label>;
}

function SelectorSuperintendencia({ superintendencias, excluir }: { superintendencias: Superintendencia[]; excluir?: string }) {
  return <select required name="superintendencia_id" defaultValue="" className="input"><option value="" disabled>Seleccionar superintendencia</option>{superintendencias.filter((item) => item.id !== excluir).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>;
}

function Modulos({ seleccionados, alternar }: { seleccionados: string[]; alternar: (id: string) => void }) {
  return <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Módulos autorizados</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{MODULOS_DISPONIBLES.map((modulo) => { const seleccionado = seleccionados.includes(modulo.id); return <button type="button" key={modulo.id} onClick={() => alternar(modulo.id)} className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${seleccionado ? 'bg-purple-950/60 border-purple-800/80 text-white' : 'bg-[#090c13] border-slate-800 text-slate-500'}`}><span>{modulo.label}</span><span>{seleccionado ? '✓' : '○'}</span></button>; })}</div></div>;
}

function AccionesModal({ cargando, cancelar, confirmar, onConfirmar, peligro = false }: { cargando: boolean; cancelar: () => void; confirmar: string; onConfirmar?: () => void; peligro?: boolean }) {
  return <div className="flex justify-end gap-3 pt-4 border-t border-slate-800"><button type="button" onClick={cancelar} className="px-4 py-2 text-xs font-semibold uppercase text-slate-400 hover:text-white">Cancelar</button><button type={onConfirmar ? 'button' : 'submit'} onClick={onConfirmar} disabled={cargando} className={`px-5 py-2.5 text-white font-bold rounded-xl text-xs uppercase disabled:opacity-50 ${peligro ? 'bg-red-700 hover:bg-red-600' : 'bg-purple-600 hover:bg-purple-500'}`}>{cargando ? 'Procesando...' : confirmar}</button></div>;
}
