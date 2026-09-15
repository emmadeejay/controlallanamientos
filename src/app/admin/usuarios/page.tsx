'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { crearUsuarioAction, resetearPasswordAction } from '@/app/actions/usuarios';
import { supabase } from '@/lib/supabase';
import { UserPlus, X, ShieldAlert, CheckCircle2, ArrowLeft, Shield, LogOut, User } from 'lucide-react';

interface Superintendencia {
  id: string;
  nombre: string;
}

interface UsuarioProfile {
  id: string;
  nombre_completo: string;
  dni: string;
  legajo: string;
  username: string;
  email: string;
  rol: string;
  superintendencia_id: string;
  modulos_permitidos?: string[];
}

const MODULOS_DISPONIBLES = [
  { id: 'allanamientos', label: 'Control de Allanamientos' },
  { id: 'deporte', label: 'Seguridad en el Deporte' },
  { id: 'contravenciones', label: 'Contravenciones' },
  { id: 'motochorros', label: 'Operación Motochorros' },
];

export default function GestionUsuariosAdminPage() {
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [superintendencias, setSuperintendencias] = useState<Superintendencia[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioProfile[]>([]);

  // Modales y contraseña
  const [usuarioAEditar, setUsuarioAEditar] = useState<string | null>(null);
  const [nuevaPass, setNuevaPass] = useState('');
  const [modulosSeleccionados, setModulosSeleccionados] = useState<string[]>(['allanamientos']);

  // Datos del usuario en sesión
  const [miUsuarioId, setMiUsuarioId] = useState<string>('');
  const [miEmail, setMiEmail] = useState<string>('');
  const [miRolActual, setMiRolActual] = useState<string>('operador');

  useEffect(() => {
    async function initData() {
      const { data: { session } } = await supabase.auth.getSession();
      
      let rolDetectado = 'operador';

      if (session?.user) {
        setMiUsuarioId(session.user.id);
        setMiEmail(session.user.email || '');

        const { data: profile } = await supabase
          .from('profiles')
          .select('rol')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profile?.rol) {
          rolDetectado = String(profile.rol).trim().toLowerCase();
          setMiRolActual(rolDetectado);
        } else if (session.user.email?.includes('cop.estadistica.ar')) {
          rolDetectado = 'administrador';
          setMiRolActual('administrador');
        }
      }

      // Traer superintendencias
      const { data: supData } = await supabase
        .from('superintendencias')
        .select('id, nombre')
        .order('nombre', { ascending: true });

      if (supData) setSuperintendencias(supData);

      // Traer usuarios
      let query = supabase.from('profiles').select('*');
      if (rolDetectado === 'supervisor') {
        query = query.neq('rol', 'administrador');
      }

      const { data: usersData } = await query.order('nombre_completo', { ascending: true });
      if (usersData) setUsuarios(usersData);
    }

    initData();
  }, []);

  const handleCerrarSesion = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const rolNormalizado = miRolActual?.toLowerCase();
  const puedeCrearUsuarios = rolNormalizado === 'administrador' || rolNormalizado === 'supervisor';

  const toggleModulo = (idModulo: string) => {
    if (modulosSeleccionados.includes(idModulo)) {
      setModulosSeleccionados(modulosSeleccionados.filter(m => m !== idModulo));
    } else {
      setModulosSeleccionados([...modulosSeleccionados, idModulo]);
    }
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setMensaje(null);

    const formData = new FormData(e.currentTarget);
    formData.append('modulos_permitidos', JSON.stringify(modulosSeleccionados));

    const res = await crearUsuarioAction(formData, miUsuarioId);
    setCargando(false);

    if (res.success) {
      setMensaje({ tipo: 'ok', texto: '¡Usuario creado correctamente con contraseña inicial ABCdef123!' });
      setModalAbierto(false);
      (e.target as HTMLFormElement).reset();
      setModulosSeleccionados(['allanamientos']);
      
      let query = supabase.from('profiles').select('*');
      if (rolNormalizado === 'supervisor') {
        query = query.neq('rol', 'administrador');
      }
      const { data: usersData } = await query.order('nombre_completo', { ascending: true });
      if (usersData) setUsuarios(usersData);
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Ocurrió un error al crear el usuario.' });
    }
  }

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-slate-900">
      
      {/* Header Institucional Estilo Select-App */}
      <header className="w-full border-b border-slate-800/80 bg-[#0c0f17]/90 backdrop-blur-md px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 relative flex-shrink-0">
            <Image
              src="/logo.png"
              alt="Logo C.O.P"
              width={40}
              height={40}
              className="object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide uppercase">Sistema Operativo COP</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Plataforma de Gestión</p>
          </div>
        </div>

        {/* Info Sesión Usuario */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 bg-[#131824] px-3 py-1.5 rounded-xl border border-slate-800">
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-300 font-mono text-[11px]">{miEmail || 'usuario@cop.estadistica.ar'}</span>
            <span className="text-slate-600">|</span>
            <span className="bg-cyan-950/80 text-cyan-400 border border-cyan-800/80 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
              {miRolActual}
            </span>
          </div>

          <button
            onClick={handleCerrarSesion}
            className="flex items-center gap-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-900/50 px-3 py-1.5 rounded-xl transition text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 flex-1 space-y-6">
        
        {/* Banner de Control Superior */}
        <div className="bg-[#0f1420]/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/select-app')}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#161c2e] hover:bg-[#1d253d] text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition border border-slate-700/60 shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Módulos</span>
            </button>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                <Shield className="w-5 h-5 text-cyan-400" />
                Gestión Centralizada de Usuarios
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Alta de operadores y asignación de permisos por sistema</p>
            </div>
          </div>

          {puedeCrearUsuarios && (
            <button
              onClick={() => setModalAbierto(true)}
              className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-cyan-950/60 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <UserPlus className="w-4 h-4" />
              <span>Nuevo Usuario</span>
            </button>
          )}
        </div>

        {/* Feedback Messages */}
        {mensaje && (
          <div
            className={`p-4 rounded-xl text-xs font-medium border flex items-center gap-3 ${
              mensaje.tipo === 'ok'
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-400'
                : 'bg-red-950/40 border-red-800/80 text-red-400'
            }`}
          >
            {mensaje.tipo === 'ok' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <ShieldAlert className="w-5 h-5 flex-shrink-0" />}
            <span>{mensaje.texto}</span>
          </div>
        )}

        {/* Nómina de Usuarios */}
        <div className="bg-[#0f1420]/80 border border-slate-800/90 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">
            Nómina de usuarios registrados ({usuarios.length})
          </h3>
          
          {usuarios.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No se encontraron usuarios para mostrar.</p>
          ) : (
            <div className="space-y-3">
              {usuarios.map((u) => (
                <div key={u.id} className="bg-[#131826] border border-slate-800/90 hover:border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
                  <div className="space-y-1">
                    <h4 className="font-bold text-white text-sm tracking-wide uppercase">{u.nombre_completo || 'Sin nombre'}</h4>
                    <p className="text-xs text-slate-400 font-mono">
                      Email: <span className="text-slate-300">{u.email}</span> | DNI: {u.dni || 'N/A'} | Legajo: {u.legajo || 'N/A'}
                    </p>
                    
                    {u.modulos_permitidos && u.modulos_permitidos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1.5">
                        {u.modulos_permitidos.map((mod) => (
                          <span key={mod} className="px-2 py-0.5 bg-[#0b0e17] border border-slate-800 text-[10px] text-cyan-400 rounded-md uppercase font-semibold">
                            {mod}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-cyan-950/60 border border-cyan-800/80 text-cyan-400 rounded-lg text-[10px] font-extrabold uppercase tracking-wider">
                      {u.rol || 'OPERADOR'}
                    </span>
                    
                    {rolNormalizado === 'administrador' && (
                      <button
                        onClick={() => setUsuarioAEditar(u.id)}
                        className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline ml-1"
                      >
                        Cambiar Clave
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal Alta de Usuario */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1420] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-[#090c13] p-4 border-b border-slate-800 flex justify-between items-center px-6">
              <h2 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-cyan-400" />
                Alta de Nuevo Usuario
              </h2>
              <button onClick={() => setModalAbierto(false)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Nombre y Apellido</label>
                <input required name="nombre_completo" type="text" placeholder="Ej: Juan Pérez" className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">DNI</label>
                  <input required name="dni" type="text" placeholder="Ej: 12345678" className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Legajo</label>
                  <input required name="legajo" type="text" placeholder="Ej: 123456" className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Correo Electrónico (Usuario)</label>
                <input required name="email" type="text" placeholder="usuario@cop.estadistica.ar" className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500" />
              </div>

              <div className="bg-[#090c13] p-3 rounded-xl border border-slate-800">
                <span className="block text-[10px] font-bold text-amber-400 uppercase">Contraseña Inicial Automática</span>
                <p className="text-xs text-slate-400 mt-0.5">
                  Se asignará por defecto: <code className="text-white bg-slate-800 px-1.5 py-0.5 rounded font-mono">ABCdef123</code>.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Superintendencia Asignada</label>
                <select required name="superintendencia_id" className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500">
                  <option value="">-- Seleccionar Superintendencia --</option>
                  {superintendencias.map((sup) => (
                    <option key={sup.id} value={sup.id}>{sup.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Rol de Usuario</label>
                <select required name="rol" className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500">
                  <option value="operador">OPERADOR (Carga diaria)</option>
                  <option value="consulta">CONSULTA (Solo lectura)</option>
                  <option value="supervisor">SUPERVISOR (Control)</option>
                  <option value="auditor">AUDITOR (Inspección)</option>
                  {rolNormalizado === 'administrador' && (
                    <option value="administrador">ADMINISTRADOR (Total)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">Módulos Autorizados</label>
                <div className="grid grid-cols-2 gap-2">
                  {MODULOS_DISPONIBLES.map((mod) => {
                    const checked = modulosSeleccionados.includes(mod.id);
                    return (
                      <div
                        key={mod.id}
                        onClick={() => toggleModulo(mod.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                          checked
                            ? 'bg-cyan-950/60 border-cyan-800/80 text-white'
                            : 'bg-[#090c13] border-slate-800 text-slate-500 hover:border-slate-700'
                        }`}
                      >
                        <span className="font-semibold text-[11px]">{mod.label}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="rounded border-slate-800 text-cyan-600 focus:ring-0"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-4">
                <button type="button" onClick={() => setModalAbierto(false)} className="px-4 py-2 text-xs font-semibold uppercase text-slate-400 hover:text-white">Cancelar</button>
                <button disabled={cargando} type="submit" className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs uppercase transition-all shadow-lg shadow-cyan-950/60">
                  {cargando ? 'Guardando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Resetear Contraseña */}
      {usuarioAEditar && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1420] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Cambiar Contraseña</h2>
            <p className="text-xs text-slate-400">Ingresá una nueva clave para el usuario.</p>
            
            <input
              type="password"
              placeholder="Nueva contraseña"
              className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              onChange={(e) => setNuevaPass(e.target.value)}
            />

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setUsuarioAEditar(null)}
                className="flex-1 px-4 py-2 text-xs font-semibold uppercase text-slate-400 hover:text-white bg-slate-800 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!nuevaPass) return alert("Ingresá una contraseña");
                  setCargando(true);
                  const res = await resetearPasswordAction(usuarioAEditar, nuevaPass);
                  setCargando(false);
                  if (res.success) {
                    alert("¡Contraseña actualizada con éxito!");
                    setUsuarioAEditar(null);
                    setNuevaPass('');
                  } else {
                    alert(res.error);
                  }
                }}
                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-xs uppercase transition shadow-lg shadow-cyan-950/60"
              >
                {cargando ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Unificado con Firma */}
      <footer className="w-full border-t border-slate-800/80 bg-[#0c0f17]/90 backdrop-blur-md py-6 text-center space-y-1">
        <p className="text-xs text-slate-400">
          Desarrollado por <span className="text-blue-400 font-semibold">Emmanuel Machado</span>
        </p>
        <p className="text-[10px] text-slate-600 tracking-wide font-medium">
          Plataforma integral de gestión <span className="text-slate-700">|</span> Sistema de estadísticas C.O.P
        </p>
      </footer>
    </div>
  );
}