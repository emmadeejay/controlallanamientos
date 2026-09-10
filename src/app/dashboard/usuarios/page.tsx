'use client';

import { useState, useEffect } from 'react';
import { crearUsuarioAction, resetearPasswordAction } from '@/app/actions/usuarios';
import { supabase } from '@/lib/supabase';
import { UserPlus, X, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface Superintendencia {
  id: string;
  nombre: string;
}

interface UsuarioProfile {
  id: string;
  nombre_completo: string;
  username: string;
  email: string;
  rol: string;
  superintendencia_id: string;
}

export default function GestionUsuariosPage() {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [superintendencias, setSuperintendencias] = useState<Superintendencia[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioProfile[]>([]);

  // Estados para el reseteo de contraseña
  const [usuarioAEditar, setUsuarioAEditar] = useState<string | null>(null);
  const [nuevaPass, setNuevaPass] = useState('');

  // Datos dinámicos del usuario en sesión
  const [miUsuarioId, setMiUsuarioId] = useState<string>('');
  const [miRolActual, setMiRolActual] = useState<string>('operador');

  useEffect(() => {
    async function initData() {
      const { data: { session } } = await supabase.auth.getSession();
      
      let rolDetectado = 'operador';

      if (session?.user) {
        setMiUsuarioId(session.user.id);

        // Consultamos el rol real del usuario logueado
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

      // Consulta de perfiles condicionada según el rol del usuario actual
      let query = supabase.from('profiles').select('*');

      // Si es supervisor (y no administrador), excluimos a los administradores de la lista
      if (rolDetectado === 'supervisor') {
        query = query.neq('rol', 'administrador');
      }

      const { data: usersData, error: userError } = await query.order('nombre_completo', { ascending: true });

      if (userError) {
        console.error('Error al cargar perfiles:', userError.message);
      }

      if (usersData) {
        setUsuarios(usersData);
      }
    }

    initData();
  }, []);

  const rolNormalizado = miRolActual?.toLowerCase();
  const puedeCrearUsuarios = rolNormalizado === 'administrador' || rolNormalizado === 'supervisor';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setMensaje(null);

    const formData = new FormData(e.currentTarget);
    const res = await crearUsuarioAction(formData, miUsuarioId);

    setCargando(false);

    if (res.success) {
      setMensaje({ tipo: 'ok', texto: '¡Usuario creado correctamente!' });
      setModalAbierto(false);
      (e.target as HTMLFormElement).reset();
      
      // Recargar lista aplicando la misma regla de rol
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
    <div className="max-w-6xl mx-auto w-full space-y-6 p-4 sm:p-8">
      
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-800/60 p-6 rounded-xl border border-slate-700/60 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Gestión de Usuarios</h1>
          <p className="text-xs text-slate-400 mt-1">Alta y administración de accesos al sistema COP</p>
        </div>

        {puedeCrearUsuarios && (
          <button
            onClick={() => setModalAbierto(true)}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-lg shadow-lg shadow-blue-600/35 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Usuario</span>
          </button>
        )}
      </div>

      {/* Mensajes de feedback */}
      {mensaje && (
        <div
          className={`p-4 rounded-xl text-sm font-medium border flex items-center gap-3 ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {mensaje.tipo === 'ok' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <ShieldAlert className="w-5 h-5 flex-shrink-0" />}
          <span>{mensaje.texto}</span>
        </div>
      )}

      {/* Listado de Usuarios */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">Usuarios Registrados ({usuarios.length})</h2>
        
        {usuarios.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No se encontraron usuarios para mostrar.</p>
        ) : (
          <div className="space-y-3">
            {usuarios.map((u) => (
              <div key={u.id} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white text-sm uppercase">{u.nombre_completo || 'Sin nombre'}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Email: {u.email} | Legajo/DNI: {u.username || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                    {u.rol || 'operador'}
                  </span>
                  
                  {rolNormalizado === 'administrador' && (
                    <button
                      onClick={() => setUsuarioAEditar(u.id)}
                      className="text-xs text-sky-400 hover:text-sky-300 font-medium underline"
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

      {/* Modal Alta de Usuario */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center px-6">
              <h2 className="font-bold text-base text-white">Alta de Nuevo Usuario</h2>
              <button onClick={() => setModalAbierto(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">Nombre y Apellido</label>
                <input required name="nombre_completo" type="text" placeholder="Ej: Juan Pérez" className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">Legajo / DNI</label>
                <input required name="legajo_o_dni" type="text" placeholder="Ej: 1234567" className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">Correo Electrónico (Usuario)</label>
                <input required name="email" type="text" placeholder="usuario@cop.estadistica.ar" className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">Contraseña Inicial</label>
                <input required name="password" type="password" minLength={6} placeholder="Mínimo 6 caracteres" className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">Superintendencia Asignada</label>
                <select required name="superintendencia_id" className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="">-- Seleccionar Superintendencia --</option>
                  {superintendencias.map((sup) => (
                    <option key={sup.id} value={sup.id}>{sup.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">Rol de Usuario</label>
                <select required name="rol" className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="operador">OPERADOR (Carga diaria)</option>
                  <option value="consulta">CONSULTA (Solo lectura)</option>
                  <option value="supervisor">SUPERVISOR (Control)</option>
                  <option value="auditor">AUDITOR (Inspección)</option>
                  {/* Los supervisores solo pueden crear estos roles o restringir si hace falta */}
                  <option value="administrador">ADMINISTRADOR (Total)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700 mt-6">
                <button type="button" onClick={() => setModalAbierto(false)} className="px-4 py-2 text-xs font-semibold uppercase text-slate-300 hover:text-white">Cancelar</button>
                <button disabled={cargando} type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs uppercase transition-all">
                  {cargando ? 'Guardando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Resetear Contraseña */}
      {usuarioAEditar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6">
            <h2 className="text-lg font-bold text-white mb-1">Cambiar Contraseña</h2>
            <p className="text-xs text-slate-400 mb-4">Ingresá una nueva clave para el usuario.</p>
            
            <input
              type="password"
              placeholder="Nueva contraseña"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white mb-6 focus:outline-none focus:border-blue-500"
              onChange={(e) => setNuevaPass(e.target.value)}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setUsuarioAEditar(null)}
                className="flex-1 px-4 py-2 text-xs font-semibold uppercase text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg"
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
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs uppercase"
              >
                {cargando ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}