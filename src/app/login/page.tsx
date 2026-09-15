'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { User, Lock, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

const LOGO_URL = '/logo_cop.png';

export default function LoginPage() {
  const router = useRouter();
  const [userInput, setUserInput] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const emailFinal = userInput.includes('@')
      ? userInput.trim()
      : `${userInput.trim()}@cop.estadistica.ar`;

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: emailFinal,
        password: password,
      });

      if (authError) {
        setError('Usuario o contraseña incorrectos.');
        return;
      }

      if (data?.session) {
        router.push('/select-app');
        router.refresh();
      } else {
        setError('No se pudo establecer la sesión.');
      }
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      setError('Ocurrió un error inesperado al intentar ingresar.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecuperarPassword = async () => {
    const emailInput = prompt("Ingresá tu usuario o correo electrónico institucional:");
    if (!emailInput) return;

    const emailFinal = emailInput.includes('@')
      ? emailInput.trim().toLowerCase()
      : `${emailInput.trim().toLowerCase()}@cop.estadistica.ar`;

    const { error } = await supabase.auth.resetPasswordForEmail(emailFinal, {
      redirectTo: `${window.location.origin}/auth/actualizar-password`,
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("¡Listo! Revisá tu correo electrónico para seguir las instrucciones de recuperación.");
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between items-center p-4 selection:bg-blue-600 selection:text-white">
      
      {/* Header Superior Minimalista */}
      <header className="w-full max-w-5xl py-4 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 relative flex-shrink-0">
            <Image
              src={LOGO_URL}
              alt="Logo C.O.P"
              width={32}
              height={32}
              className="object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-xs font-bold text-white tracking-wide uppercase">
              SISTEMA DE ESTADISTICAS COP
            </h1>
            <p className="text-[9px] text-slate-400 uppercase tracking-widest">
              PLATAFORMA INTEGRAL DE GESTIÓN
            </p>
          </div>
        </div>
      </header>

      {/* Card de Login Central */}
      <main className="w-full max-w-sm my-auto py-8">
        <div className="bg-[#0f1420]/90 border border-slate-800/90 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-2xl space-y-6">
          
          {/* Logo Central e Identidad */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-20 h-20 relative my-1 flex items-center justify-center">
              <Image
                src={LOGO_URL}
                alt="Logo C.O.P Central"
                width={80}
                height={80}
                className="object-contain drop-shadow-lg"
                priority
              />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide uppercase">
                SISTEMA ESTADÍSTICAS C.O.P.
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Plataforma Integral de Gestión
              </p>
            </div>
          </div>

          {/* Banner de Error */}
          {error && (
            <div className="bg-red-950/40 border border-red-800/80 rounded-xl p-3.5 flex items-center gap-3 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleLogin} autoComplete="off" className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                Usuario Institucional
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  name="user_login_field"
                  autoComplete="off"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Ej: 1234567 o usuario@cop"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                Contraseña
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                <input
                  type="password"
                  name="user_password_field"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-blue-900/40 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={handleRecuperarPassword}
              className="text-xs text-slate-500 hover:text-slate-300 transition underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl py-4 border-t border-slate-800/60 text-center">
        <p className="text-xs text-slate-500">
          Diseñado por <span className="text-blue-400 font-semibold">EMMANUEL MACHADO</span>
        </p>
      </footer>
    </div>
  );
}