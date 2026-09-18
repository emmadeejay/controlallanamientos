'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Lock, Eye, EyeOff, CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
import Image from 'next/image';

export default function ActualizarPasswordPage() {
  const router = useRouter();
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const handleActualizar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (nuevaPassword.length < 6) {
      setMensaje({ tipo: 'error', texto: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setMensaje({ tipo: 'error', texto: 'Las contraseñas no coinciden.' });
      return;
    }

    setCargando(true);
    setMensaje(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: nuevaPassword,
      });

      if (error) throw error;

      setMensaje({
        tipo: 'ok',
        texto: '¡Contraseña actualizada con éxito! Redirigiendo...',
      });

      setTimeout(() => {
        router.push('/select-app');
      }, 2000);
    } catch (err: any) {
      setMensaje({
        tipo: 'error',
        texto: err.message || 'Error al actualizar la contraseña. El enlace puede haber expirado.',
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between items-center p-4">
      <div />

      <div className="w-full max-w-md bg-[#0f172a]/70 border border-slate-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 relative mb-3">
            <Image
              src="/logo_cop.png"
              alt="COP Escudo"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-lg font-bold text-white tracking-wide">
            Establecer Nueva Contraseña
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Ingresá tu nueva clave para recuperar el acceso
          </p>
        </div>

        {mensaje && (
          <div
            className={`mb-6 p-3 rounded-xl text-xs border flex items-center gap-2 ${
              mensaje.tipo === 'ok'
                ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                : 'bg-red-950/60 border-red-800/80 text-red-300'
            }`}
          >
            {mensaje.tipo === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{mensaje.texto}</span>
          </div>
        )}

        <form onSubmit={handleActualizar} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-300 tracking-wider mb-1.5">
              Nueva Contraseña
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-[#090d16] border border-slate-800 rounded-xl pl-10 pr-11 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 p-1 text-slate-500 hover:text-slate-300 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-300 tracking-wider mb-1.5">
              Confirmar Nueva Contraseña
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                placeholder="Repetir contraseña"
                className="w-full bg-[#090d16] border border-slate-800 rounded-xl pl-10 pr-11 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 disabled:opacity-50"
          >
            {cargando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Actualizando...</span>
              </>
            ) : (
              'Guardar Nueva Contraseña'
            )}
          </button>
        </form>
      </div>

      <footer className="py-4 text-center text-xs text-slate-500">
        Diseñado por <span className="text-blue-400 font-semibold">EMMANUEL MACHADO</span>
      </footer>
    </div>
  );
}