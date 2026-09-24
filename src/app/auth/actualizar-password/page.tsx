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

    if (nuevaPassword.length < 10) {
      setMensaje({ tipo: 'error', texto: 'La contraseña debe tener al menos 10 caracteres.' });
      return;
    }

    if (!/[a-z]/.test(nuevaPassword) || !/[A-Z]/.test(nuevaPassword) || !/\d/.test(nuevaPassword)) {
      setMensaje({ tipo: 'error', texto: 'La contraseña debe incluir mayúscula, minúscula y número.' });
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
    <div className="cop-shell flex min-h-screen flex-col justify-between text-slate-100">
      <header className="cop-command-header w-full">
        <div className="mx-auto flex min-h-[76px] w-full max-w-[1320px] items-center gap-3 px-4 sm:px-6">
          <div className="flex h-12 w-12 items-center justify-center border-r border-[#26364d] pr-3">
            <Image src="/logo_cop.png" alt="Escudo COP" width={44} height={44} className="object-contain" priority />
          </div>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.08em] text-white">P.I.G. C.O.P.</p>
            <p className="cop-kicker mt-1">Dirección Centro de Operaciones Policiales</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md border border-[#33465f] border-t-2 border-t-[#c4a35a] bg-[#071426] p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center border border-[#806c3f] bg-[#050e1c] text-[#c4a35a]">
            <Lock className="h-5 w-5" />
          </div>
          <p className="cop-kicker mb-2">Gestión de credenciales</p>
          <h1 className="text-lg font-extrabold uppercase tracking-[0.05em] text-white">
            Establecer nueva contraseña
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Ingresá tu nueva clave para recuperar el acceso
          </p>
        </div>

        {mensaje && (
          <div
            className={`mb-6 flex items-center gap-2 border p-3 text-xs ${
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
                minLength={10}
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                placeholder="Mínimo 10 caracteres"
                className="w-full border border-[#33465f] bg-[#050e1c] py-2.5 pl-10 pr-11 text-xs text-white placeholder-slate-600 transition focus:border-[#c4a35a] focus:outline-none"
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
                minLength={10}
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                placeholder="Repetir contraseña"
                className="w-full border border-[#33465f] bg-[#050e1c] py-2.5 pl-10 pr-11 text-xs text-white placeholder-slate-600 transition focus:border-[#c4a35a] focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="cop-action-primary mt-2 flex w-full items-center justify-center gap-2 py-2.5 disabled:opacity-50"
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
      </main>

      <footer className="border-t border-[#26364d] bg-[#071426] py-5 text-xs text-slate-500">
        <div className="mx-auto flex max-w-[1320px] flex-col justify-between gap-1 px-6 text-center sm:flex-row sm:text-left">
          <p className="font-bold uppercase tracking-[0.12em] text-slate-400">Dirección Centro de Operaciones Policiales</p>
          <p className="text-[10px]">Plataforma Integral de Gestión · Desarrollo: Emmanuel Machado</p>
        </div>
      </footer>
    </div>
  );
}
