'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User, Lock, AlertCircle, Loader2 } from 'lucide-react';

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

    // Si ingresó un email completo con '@', lo respeta.
    // Si ingresó legajo o usuario, le añade el dominio institucional.
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
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      setError('Ocurrió un error inesperado al intentar ingresar.');
      setLoading(false);
    }
  };

  // Función para solicitar el reseteo por email
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 backdrop-blur-xl rounded-2xl p-8 shadow-2xl">
        
        {/* Encabezado con Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-20 h-20 bg-slate-950/50 border border-slate-800 rounded-2xl p-3 flex items-center justify-center shadow-inner mb-4">
            <img 
              src={LOGO_URL} 
              alt="Logo C.O.P." 
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">SISTEMA COP</h1>
          <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-1">
            Registro & Gestión de Allanamientos
          </p>
        </div>

        {/* Mensaje de Error */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 flex items-center gap-3 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Formulario de Login sin Autocompletado molesto */}
        <form onSubmit={handleLogin} autoComplete="off" className="space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Usuario Institucional
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                name="user_login_field"
                autoComplete="off"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Ej: 1234567 o usuario@cop.estadistica.ar"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                name="user_password_field"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validando Credenciales...</span>
              </>
            ) : (
              <span>Ingresar al Sistema</span>
            )}
          </button>
        </form>

        {/* Botón de recuperación de contraseña */}
        <div className="text-center mt-6">
          <button 
            type="button" 
            onClick={handleRecuperarPassword}
            className="text-xs text-slate-400 hover:text-blue-400 transition-colors underline"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

      </div>
    </div>
  );
}