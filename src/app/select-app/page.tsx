'use client';

import { useRouter } from 'next/navigation';
import { Shield, Layers, ArrowRight } from 'lucide-react';

export default function SelectAppPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-8 text-center">
        
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            Plataforma de Gestión
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Seleccione el módulo al que desea ingresar
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          {/* Módulo Allanamientos */}
          <div 
            onClick={() => router.push('/allanamientos')}
            className="group relative bg-slate-900/80 border border-slate-800 hover:border-blue-500/50 p-6 rounded-2xl cursor-pointer transition-all hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1"
          >
            <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
              <Shield className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
              Control de Allanamientos
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Registro, seguimiento y control semáforo de procedimientos de allanamiento por superintendencia.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
              <span>Ingresar al módulo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Módulo Futuro / Próximamente */}
          <div className="relative bg-slate-900/30 border border-slate-800/50 p-6 rounded-2xl opacity-60 cursor-not-allowed">
            <div className="w-12 h-12 bg-slate-800/50 border border-slate-700/30 rounded-xl flex items-center justify-center text-slate-500 mb-4">
              <Layers className="w-6 h-6" />
            </div>
            <span className="absolute top-6 right-6 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
              Próximamente
            </span>
            <h2 className="text-lg font-bold text-slate-300 mb-2">
              Nuevo Módulo
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              Módulo adicional en desarrollo para ampliar la cobertura de gestión operacional.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span>No disponible</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}