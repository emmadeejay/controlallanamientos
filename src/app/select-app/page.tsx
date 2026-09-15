'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Shield, Trophy, AlertTriangle, Bike, ArrowRight, Loader2, LogOut } from 'lucide-react';

interface Modulo {
  id: string;
  titulo: string;
  descripcion: string;
  icono: any;
  ruta: string;
  color: string;
}

export default function SelectAppPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [modulosPermitidos, setModulosPermitidos] = useState<Modulo[]>([]);

  // Catálogo completo de módulos del sistema
  const CATALOGO_MODULOS: Modulo[] = [
    {
      id: 'allanamientos',
      titulo: 'Control de Allanamientos',
      descripcion: 'Registro, seguimiento y control semáforo de procedimientos por superintendencia.',
      icono: Shield,
      ruta: '/allanamientos',
      color: 'blue'
    },
    {
      id: 'deporte',
      titulo: 'Seguridad en el Deporte',
      descripcion: 'Planificación de operativos, cantidad de efectivos y novedades en eventos deportivos.',
      icono: Trophy,
      ruta: '/deporte',
      color: 'emerald'
    },
    {
      id: 'contravenciones',
      titulo: 'Contravenciones',
      descripcion: 'Control y registro de actas contravencionales y procedimientos administrativos.',
      icono: AlertTriangle,
      ruta: '/contravenciones',
      color: 'amber'
    },
    {
      id: 'motochorros',
      titulo: 'Operación Motochorros',
      descripcion: 'Seguimiento de interceptaciones, secuestros de ciclomotores y aprehensiones.',
      icono: Bike,
      ruta: '/motochorros',
      color: 'purple'
    }
  ];

  useEffect(() => {
    evaluarPermisos();
  }, []);

  async function evaluarPermisos() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Obtener el perfil y roles del usuario
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      const userMetaRole = session.user.user_metadata?.role || session.user.app_metadata?.role;
      const rawRole = userMetaRole || profile?.role || profile?.rol || '';
      const rol = String(rawRole).toLowerCase().trim();

      const esAdminOSupervisor = ['administrador', 'supervisor', 'admin', 'superadmin'].includes(rol);

      if (esAdminOSupervisor) {
        // Los admins/supervisores ven todos los módulos existentes
        setModulosPermitidos(CATALOGO_MODULOS);
      } else {
        // Si el usuario tiene permisos específicos en profile.modulos_permitidos
        const modulosUsuario: string[] = profile?.modulos_permitidos || ['allanamientos'];
        
        const permitidos = CATALOGO_MODULOS.filter(m => modulosUsuario.includes(m.id));
        setModulosPermitidos(permitidos.length > 0 ? permitidos : [CATALOGO_MODULOS[0]]);
      }

    } catch (err) {
      console.error('Error al verificar permisos:', err);
      // Fallback seguro: solo mostrar allanamientos
      setModulosPermitidos([CATALOGO_MODULOS[0]]);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-xs font-semibold">Cargando módulos autorizados...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between p-6">
      
      {/* Header superior con Botón Cerrar Sesión */}
      <div className="flex justify-end">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Cerrar Sesión</span>
        </button>
      </div>

      {/* Contenido Principal */}
      <div className="max-w-5xl w-full mx-auto space-y-8 text-center my-auto py-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl uppercase">
            Plataforma de Gestión
          </h1>
          <p className="mt-3 text-xs text-slate-400">
            Seleccione el módulo al que desea ingresar
          </p>
        </div>

        {/* Grilla de Módulos Permitidos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 text-left">
          {modulosPermitidos.map((modulo) => {
            const IconoComponente = modulo.icono;

            return (
              <div 
                key={modulo.id}
                onClick={() => router.push(modulo.ruta)}
                className="group relative bg-slate-900/80 border border-slate-800 hover:border-blue-500/50 p-6 rounded-2xl cursor-pointer transition-all hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                    <IconoComponente className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                    {modulo.titulo}
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                    {modulo.descripcion}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                  <span>Ingresar al módulo</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer / Firma */}
      <footer className="text-center text-[11px] text-slate-500 py-2">
        Diseñado por <span className="font-semibold text-slate-300">EMMANUEL MACHADO</span>
      </footer>

    </div>
  );
}