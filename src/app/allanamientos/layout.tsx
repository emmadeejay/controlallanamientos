'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { diasHastaFecha, perfilTieneAcceso } from '@/lib/usuarios';
import { AlertTriangle, LogOut, User, Shield, FileText, BarChart3, Grid, Search, Building2 } from 'lucide-react';

const LOGO_URL = '/logo_cop.png';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('operador');
  const [userSuperintendencia, setUserSuperintendencia] = useState<string | null>(null);
  const [diasVigencia, setDiasVigencia] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkAndFetchUser = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          window.location.replace('/login');
          return;
        }

        const email = user.email || '';
        let rolFinal = 'operador';

        const { data: profile } = await supabase
          .from('profiles')
          .select('rol, activo, estado_cuenta, vigencia_institucional_hasta, modulos_permitidos, superintendencia_id')
          .eq('id', user.id)
          .single();

        let superintendenciaNombre: string | null = null;
        if (profile?.superintendencia_id) {
          const { data: dependencia } = await supabase
            .from('superintendencias')
            .select('nombre')
            .eq('id', profile.superintendencia_id)
            .maybeSingle();
          superintendenciaNombre = dependencia?.nombre || null;
        }

        if (profile && profile.rol) {
          rolFinal = String(profile.rol).trim().toLowerCase();
        }

        const esGestion = ['admin', 'administrador', 'supervisor'].includes(rolFinal);
        const esConsultaEjecutiva = ['auditor', 'consulta'].includes(rolFinal);
        const tieneModulo =
          esGestion ||
          esConsultaEjecutiva ||
          profile?.modulos_permitidos?.includes('allanamientos');
        if (!profile || !perfilTieneAcceso(profile) || !tieneModulo) {
          window.location.replace('/select-app');
          return;
        }

        if (isMounted) {
          setUserEmail(email);
          setUserRole(rolFinal);
          setUserSuperintendencia(superintendenciaNombre);
          setDiasVigencia(diasHastaFecha(profile.vigencia_institucional_hasta));
        }
      } catch (err) {
        console.error('Error al verificar sesión:', err);
        window.location.replace('/login');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkAndFetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUserEmail(null);
        setUserRole('operador');
        window.location.replace('/login');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    window.location.replace('/login');
  };

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

  const rolNormalizado = userRole.toLowerCase();
  const esOperador = rolNormalizado === 'operador';
  const esConsultaEjecutiva = ['auditor', 'consulta'].includes(rolNormalizado);

  return (
    <div className="cop-shell flex min-h-screen flex-col justify-between text-slate-100">
      <div>
        <header className="cop-command-header sticky top-0 z-50">
          <div className="mx-auto flex min-h-[76px] max-w-[1800px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            
            <div className="flex items-center gap-3 sm:gap-6">
              <div 
                onClick={() => router.push(esConsultaEjecutiva ? '/allanamientos/metricas' : '/select-app')} 
                className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
                title={esConsultaEjecutiva ? 'Volver a Estadísticas' : 'Volver al Menú Principal'}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border-r border-[#26364d] pr-3">
                  <img src={LOGO_URL} alt="Logo" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="hidden sm:block">
                  <span className="block text-[15px] font-extrabold leading-none tracking-[0.04em] text-white">
                    SISTEMA DE ALLANAMIENTOS
                  </span>
                  <span className="cop-kicker mt-1.5 block">
                    Dirección Centro de Operaciones Policiales
                  </span>
                </div>
              </div>

              {!esConsultaEjecutiva && (
                <button
                  onClick={() => router.push('/select-app')}
                  className="border border-[#26364d] p-2 text-slate-400 transition hover:border-[#806c3f] hover:text-[#c4a35a]"
                  title="Menú Principal de Apps"
                >
                  <Grid className="w-4 h-4" />
                </button>
              )}

              <nav className="flex items-center border-l border-[#26364d] pl-2 sm:pl-4">
                {!esConsultaEjecutiva && (
                  <Link
                    href="/allanamientos"
                    className="cop-nav-link"
                    data-active={pathname === '/allanamientos'}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Allanamientos</span>
                  </Link>
                )}

                {!esOperador && (
                  <Link
                    href="/allanamientos/buscar"
                    className="cop-nav-link"
                    data-active={pathname === '/allanamientos/buscar'}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Buscar</span>
                  </Link>
                )}

                {!esOperador && (
                  <Link
                    href="/allanamientos/metricas"
                    className="cop-nav-link"
                    data-active={pathname.includes('/metricas')}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Estadísticas</span>
                  </Link>
                )}
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <div className="cop-session-block hidden w-[510px] shrink-0 2xl:flex">
                <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-xs text-slate-300">
                  <User className="w-3.5 h-3.5 text-blue-400" />
                  <div className="min-w-0 flex-1">
                    <span className="block max-w-[240px] truncate font-semibold">{userEmail}</span>
                    {esOperador && userSuperintendencia && (
                      <span
                        className="mt-0.5 flex items-start gap-1 text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-500"
                        title={userSuperintendencia}
                      >
                        <Building2 className="h-2.5 w-2.5 shrink-0" />
                        <span>{userSuperintendencia}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="cop-session-role">
                  <Shield className="w-3 h-3" />
                  <span>{userRole}</span>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex cursor-pointer items-center gap-2 border border-red-900/70 bg-red-950/20 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-400 transition hover:bg-red-950/50"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </header>

        {esOperador && userSuperintendencia && (
          <div className="border-b border-[#26364d] bg-[#050e1c] px-4 py-2 2xl:hidden sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1800px] items-start gap-2 text-[9px] font-extrabold uppercase leading-snug tracking-[0.045em] text-slate-400">
              <Building2 className="mt-0.5 h-3 w-3 shrink-0 text-[#c4a35a]" />
              <span>{userSuperintendencia}</span>
            </div>
          </div>
        )}

        {diasVigencia !== null && diasVigencia >= 0 && diasVigencia <= 10 && (
          <div className="border-b border-amber-800/50 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-300">
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
            Tu validación institucional vence en {diasVigencia} {diasVigencia === 1 ? 'día' : 'días'}.
            Enviá la documentación al correo institucional.
          </div>
        )}

        <main className="pt-6">{children}</main>
      </div>

      <footer className="mt-12 border-t border-[#26364d] bg-[#071426] py-5 text-xs text-slate-500">
        <div className="mx-auto flex max-w-[1500px] flex-col justify-between gap-1 px-6 sm:flex-row sm:items-center">
          <p className="font-bold uppercase tracking-[0.12em] text-slate-400">Dirección Centro de Operaciones Policiales</p>
          <p className="text-[10px]">Sistema de Allanamientos · Desarrollo: Emmanuel Machado</p>
        </div>
      </footer> 
    </div>
  );
}
