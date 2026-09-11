'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { LogOut, User, Shield, Users, FileText, BarChart3 } from 'lucide-react';

const LOGO_URL = '/logo_cop.png';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('operador');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkAndFetchUser = async () => {
      try {
        // 1. Intentar cargar instantáneamente desde caché local si existe
        const cachedEmail = localStorage.getItem('cop_user_email');
        const cachedRole = localStorage.getItem('cop_user_role');

        if (cachedEmail && cachedRole) {
          if (isMounted) {
            setUserEmail(cachedEmail);
            setUserRole(cachedRole);
            setLoading(false); // Liberamos la pantalla de carga de inmediato
          }
        }

        // 2. Timeout de seguridad de 6 segundos para la llamada a Supabase
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout al verificar sesión')), 6000)
        );

        const getUserPromise = supabase.auth.getUser();
        const res: any = await Promise.race([getUserPromise, timeoutPromise]);
        const { data: { user }, error: userError } = res;

        if (userError || !user) {
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

        // 3. Actualizar la caché local con los datos reales y frescos
        localStorage.setItem('cop_user_email', email);
        localStorage.setItem('cop_user_role', rolFinal);

        if (isMounted) {
          setUserEmail(email);
          setUserRole(rolFinal);
        }
      } catch (err) {
        console.error('Error o timeout al verificar sesión:', err);
        // Si no hay caché previa y falla la red, redirigimos al login por seguridad
        if (!localStorage.getItem('cop_user_email')) {
          window.location.href = '/login';
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkAndFetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        localStorage.clear();
        setUserEmail(null);
        setUserRole('operador');
        window.location.href = '/login';
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
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
          <p className="text-xs text-slate-400 font-medium">Cargando Sistema COP...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between min-h-screen bg-slate-950 text-slate-100">
      <div>
        <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
            
            {/* Logo y Navegación */}
            <div className="flex items-center gap-3 sm:gap-6">
              <div 
                onClick={() => router.push('/dashboard')} 
                className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
              >
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <img src={LOGO_URL} alt="Logo" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="hidden sm:block">
                  <span className="font-bold text-white text-base tracking-tight block leading-none">
                    Sistema de Allanamientos
                  </span>
                  <span className="text-[10px] text-slate-400 tracking-wider uppercase font-medium">
                    Módulo Operativo
                  </span>
                </div>
              </div>

              {/* Pestañas de navegación visibles siempre */}
              <nav className="flex items-center gap-1 border-l border-slate-800 pl-3 sm:pl-6">
                <Link
                  href="/dashboard"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                    pathname === '/dashboard'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Allanamientos</span>
                </Link>

                <Link
                  href="/dashboard/metricas"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                    pathname.includes('/metricas')
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Estadísticas</span>
                </Link>

                {esAdminOSupervisor && (
                  <Link
                    href="/dashboard/usuarios"
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
                      pathname.includes('/usuarios')
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Usuarios</span>
                  </Link>
                )}
              </nav>
            </div>

            {/* Información Perfil & Logout */}
            <div className="flex items-center gap-2 sm:gap-4">
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

        <main className="pt-6">{children}</main>
      </div>

      {/* Pie de página */}
      <footer className="border-t border-slate-800/80 py-6 mt-12 text-center text-xs text-slate-500 bg-slate-900/40 backdrop-blur-sm">
        <p className="font-medium text-slate-400">
          Desarrollado por <span className="text-blue-400 font-semibold">Emmanuel Machado</span>
        </p>
        <p className="mt-1 text-[10px] text-slate-600">
          Sistema de Gestión de Allanamientos | Módulo Operativo COP
        </p>
      </footer>
    </div>
  );
}