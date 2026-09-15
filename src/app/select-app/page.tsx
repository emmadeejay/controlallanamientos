'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Shield, Users, FileText, ArrowRight, LogOut, User, Trophy, ShieldAlert, Bike } from 'lucide-react';

const LOGO_URL = '/logo_cop.png';

export default function SelectAppPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('operador');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          localStorage.clear();
          window.location.href = '/login';
          return;
        }

        const email = user.email || '';
        let rolFinal = 'operador';

        let { data: profile } = await supabase
          .from('profiles')
          .select('rol')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile && email) {
          const { data: profileByEmail } = await supabase
            .from('profiles')
            .select('rol')
            .eq('email', email)
            .maybeSingle();

          if (profileByEmail) profile = profileByEmail;
        }

        if (profile && profile.rol) {
          rolFinal = String(profile.rol).trim().toLowerCase();
        } else if (email === '1234567@cop.estadistica.ar' || email.includes('cop.estadistica.ar')) {
          rolFinal = 'administrador';
        }

        if (isMounted) {
          setUserEmail(email);
          setUserRole(rolFinal);
        }
      } catch (err) {
        console.error('Error al verificar sesión:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    localStorage.clear();
    sessionStorage.clear();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const esAdminOSupervisor = userRole === 'administrador' || userRole === 'supervisor';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-400 font-medium">Cargando Módulos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Header General */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <img src={LOGO_URL} alt="Logo" className="max-h-full max-w-full object-contain" />
            </div>
            <div>
              <span className="font-bold text-white text-base tracking-tight block leading-none">
                Sistema Operativo COP
              </span>
              <span className="text-[10px] text-slate-400 tracking-wider uppercase font-medium">
                Plataforma de Gestión
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-medium max-w-[140px] truncate">{userEmail}</span>
              </div>
              <span className="text-slate-700">|</span>
              <div className="flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                <Shield className="w-3 h-3" />
                <span className="capitalize">{userRole}</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal / Selección de Módulos */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 flex flex-col justify-center">
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Selecciona un Módulo
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Accede a las herramientas disponibles según tu nivel de permiso
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. Módulo Allanamientos */}
          <div
            onClick={() => router.push('/allanamientos')}
            className="group relative bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                  Módulo de Allanamientos
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Carga, control de actas, seguimiento semanal y métricas de operativos realizados.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-blue-400">
              <span>Ingresar al módulo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 2. Módulo Seguridad en el Deporte */}
          <div
            onClick={() => router.push('/seguridad-deporte')}
            className="group relative bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                  Seguridad en el Deporte
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Control de eventos deportivos, operativos en estadios y actas de admisión.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <span>Ingresar al módulo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 3. Módulo Contravenciones */}
          <div
            onClick={() => router.push('/contravenciones')}
            className="group relative bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/10 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                  Módulo Contravenciones
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Registro y seguimiento de actas de contravención y faltas jurisdiccionales.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-amber-400">
              <span>Ingresar al módulo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 4. Módulo Operación Motochorros */}
          <div
            onClick={() => router.push('/motochorros')}
            className="group relative bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/10 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                <Bike className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">
                  Operación Motochorros
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Control de interceptaciones, secuestros vehiculares y operativos focalizados.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-cyan-400">
              <span>Ingresar al módulo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 5. Tarjeta Usuarios (Solo Admin / Supervisor) */}
          {esAdminOSupervisor && (
            <div
              onClick={() => router.push('/admin/usuarios')}
              className="group relative bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/10 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">
                    Gestión de Usuarios
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Administración centralizada de accesos, creación de cuentas y roles del personal.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-purple-400">
                <span>Acceder a administración</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Solicitado */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500 bg-slate-900/40 backdrop-blur-sm">
        <p className="font-medium text-slate-400">
          Desarrollado por <span className="text-blue-400 font-semibold">Emmanuel Machado</span>
        </p>
        <p className="mt-1 text-[10px] text-slate-600">
          Plataforma integral de gestión | Sistema de estadísticas C.O.P
        </p>
      </footer>
    </div>
  );
}