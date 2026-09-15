'use client';

import { useState } from 'react';
import Image from 'next/image';
import { User, Lock, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Lógica de inicio de sesión
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between items-center p-4 selection:bg-blue-600 selection:text-white">
      
      {/* Header Superior Minimalista */}
      <header className="w-full max-w-5xl py-4 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 relative flex-shrink-0">
            <Image
              src="/logo_cop.png"
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
            <div className="w-20 h-20 relative my-1">
              <Image
                src="/logo_cop.png"
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

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                Usuario Institucional
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                <input
                  required
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Ej: 1234567 o usuario@cop"
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
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-blue-900/40 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <span>Ingresar al Sistema</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="text-center pt-2">
            <button
              type="button"
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