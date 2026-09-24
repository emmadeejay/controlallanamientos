'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cambiarPasswordObligatorioAction } from '@/app/actions/usuarios';
import { diasHastaFecha, evaluarEstadoAcceso, type EstadoAcceso } from '@/lib/usuarios';
import { Shield, Users, FileText, ArrowRight, LogOut, User, ShieldAlert, Bike, KeyRound, AlertTriangle, ClipboardCheck, Clock3, Building2 } from 'lucide-react';
import InstitutionalDialog from '@/components/InstitutionalDialog';

const LOGO_URL = '/logo_cop.png';

function PelotaFutbolIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Z" />
      <path d="m9 9.2-3.2-.8M15 9.2l3.2-.8M10.1 12.7l-2 3.1M13.9 12.7l2 3.1M8.1 15.8l.3 3M15.9 15.8l-.3 3" />
    </svg>
  );
}

export default function SelectAppPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('operador');
  const [userSuperintendencia, setUserSuperintendencia] = useState<string | null>(null);
  const [modulosPermitidos, setModulosPermitidos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [estadoAcceso, setEstadoAcceso] = useState<EstadoAcceso>('activo');
  const [diasVigencia, setDiasVigencia] = useState<number | null>(null);

  const [requiereCambioClave, setRequiereCambioClave] = useState(false);
  const [nuevaClave, setNuevaClave] = useState('');
  const [confirmarClave, setConfirmarClave] = useState('');
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [claveActualizada, setClaveActualizada] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkUser = async () => {
      try {
        setLoading(true);

        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          window.location.replace('/login');
          return;
        }

        const email = user.email ? user.email.toLowerCase().trim() : '';

        const { data: profile } = await supabase
          .from('profiles')
          .select('rol, activo, estado_cuenta, vigencia_institucional_hasta, requiere_cambio_clave, modulos_permitidos, superintendencia_id')
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

        if (isMounted) {
          setUserEmail(email);

          const rolDetectado = profile?.rol ? String(profile.rol).trim().toLowerCase() : 'operador';
          setUserRole(rolDetectado);
          setUserSuperintendencia(superintendenciaNombre);
          const estadoDetectado = profile
            ? evaluarEstadoAcceso(profile)
            : 'deshabilitado';
          setEstadoAcceso(estadoDetectado);
          setDiasVigencia(
            profile ? diasHastaFecha(profile.vigencia_institucional_hasta) : null,
          );

          // Fail-Safe: Si no hay módulos en la base, se deniega todo por defecto asignando []
          setModulosPermitidos(profile?.modulos_permitidos || []);

          if (
            profile?.requiere_cambio_clave &&
            (estadoDetectado === 'activo' || estadoDetectado === 'por_vencer')
          ) {
            setRequiereCambioClave(true);
          }
        }
      } catch (err) {
        console.error('Error al verificar sesión:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkUser();

    const handleFocus = () => {
      router.refresh();
      checkUser();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, [router]);

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    window.location.replace('/login');
  };

  const handleCambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorClave(null);

    if (nuevaClave.length < 10) {
      setErrorClave('La contraseña debe tener al menos 10 caracteres.');
      return;
    }

    if (!/[a-z]/.test(nuevaClave) || !/[A-Z]/.test(nuevaClave) || !/\d/.test(nuevaClave)) {
      setErrorClave('La contraseña debe incluir mayúscula, minúscula y número.');
      return;
    }

    if (nuevaClave !== confirmarClave) {
      setErrorClave('Las contraseñas no coinciden.');
      return;
    }

    if (nuevaClave === 'ABCdef123') {
      setErrorClave('Debes ingresar una contraseña diferente a la clave por defecto.');
      return;
    }

    setGuardandoClave(true);
    const res = await cambiarPasswordObligatorioAction(nuevaClave);
    setGuardandoClave(false);

    if (res.success) {
      setRequiereCambioClave(false);
      setNuevaClave('');
      setConfirmarClave('');
      setClaveActualizada(true);
    } else {
      setErrorClave(res.error || 'Ocurrió un error al actualizar la contraseña.');
    }
  };

  const esAdminOSupervisor = userRole === 'administrador' || userRole === 'supervisor';
  const esAdministrador = userRole === 'administrador' || userRole === 'admin';
  const tieneAcceso = (moduloId: string) => esAdminOSupervisor || modulosPermitidos.includes(moduloId);

  if (loading) {
    return (
      <div className="cop-shell min-h-screen text-slate-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c4a35a] border-t-transparent" />
          <p className="cop-kicker">Verificando permisos</p>
        </div>
      </div>
    );
  }

  const accesoRestringido = ['pausado', 'deshabilitado', 'validacion_vencida'].includes(
    estadoAcceso,
  );

  if (accesoRestringido) {
    const contenido = {
      pausado: {
        titulo: 'Cuenta pausada temporalmente',
        detalle: 'Tu acceso fue pausado por la oficina COP. Comunicate mediante el correo institucional para conocer el estado de la cuenta.',
      },
      deshabilitado: {
        titulo: 'Cuenta con baja operativa',
        detalle: 'La cuenta permanece registrada para conservar su trazabilidad, pero no tiene acceso a los módulos.',
      },
      validacion_vencida: {
        titulo: 'Validación institucional vencida',
        detalle: 'Enviá la documentación requerida al correo institucional. Un supervisor deberá revalidar tu asignación antes de que puedas continuar.',
      },
    }[estadoAcceso as 'pausado' | 'deshabilitado' | 'validacion_vencida'];

    return (
      <div className="cop-shell min-h-screen text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-xl border border-[#33465f] border-l-4 border-l-[#c4a35a] bg-[#071426] p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border border-[#806c3f] bg-[#050e1c] text-[#c4a35a]">
            <Clock3 className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-white">{contenido.titulo}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{contenido.detalle}</p>
          <p className="mt-4 text-xs text-slate-500">Usuario: {userEmail}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="cop-action-secondary mt-6 inline-flex items-center gap-2 !border-red-900/70 !text-red-400 hover:!bg-red-950/40"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cop-shell flex min-h-screen flex-col justify-between text-slate-100 selection:bg-[#806c3f] selection:text-white">
      <header className="cop-command-header sticky top-0 z-40">
        <div className="mx-auto flex min-h-[76px] max-w-[1800px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center border-r border-[#26364d] pr-3">
              <img src={LOGO_URL} alt="Logo" className="max-h-full max-w-full object-contain" />
            </div>
            <div>
              <span className="hidden text-[14px] font-extrabold leading-none tracking-[0.035em] text-white sm:block lg:text-[15px]">
                PLATAFORMA INTEGRAL DE GESTIÓN COP
              </span>
              <span className="cop-kicker mt-1.5 hidden sm:block">
                Dirección Centro de Operaciones Policiales
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div className="cop-session-block hidden w-[clamp(360px,30vw,510px)] shrink-0 min-[1500px]:flex">
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-xs text-slate-300">
                <User className="w-3.5 h-3.5 text-[#c4a35a]" />
                <div className="min-w-0 flex-1">
                  <span className="block max-w-[240px] truncate font-semibold">{userEmail}</span>
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

      <div className="border-b border-[#26364d] bg-[#071426] px-4 py-2 min-[1500px]:hidden sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 text-[10px]">
          <div className="flex min-w-0 items-center gap-2 text-slate-300" title={userEmail || undefined}>
            <User className="h-3.5 w-3.5 shrink-0 text-[#c4a35a]" />
            <span className="truncate font-semibold">{userEmail}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 font-extrabold uppercase tracking-[0.07em] text-[#c4a35a]">
            <Shield className="h-3 w-3" />
            <span>{userRole}</span>
          </div>
        </div>
      </div>

      {userRole === 'operador' && userSuperintendencia && (
        <div className="border-b border-[#26364d] bg-[#050e1c] px-4 py-2 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1800px] items-start gap-2 text-[9px] font-extrabold uppercase leading-snug tracking-[0.045em] text-slate-400">
            <Building2 className="mt-0.5 h-3 w-3 shrink-0 text-[#c4a35a]" />
            <span>{userSuperintendencia}</span>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        {estadoAcceso === 'por_vencer' && diasVigencia !== null && (
          <div className="mb-6 flex items-start gap-3 border border-amber-800/60 border-l-4 border-l-amber-500 bg-amber-950/20 p-4 text-amber-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold">Validación institucional próxima a vencer</p>
              <p className="mt-1 text-xs text-amber-300/80">
                Restan {diasVigencia} {diasVigencia === 1 ? 'día' : 'días'}. Enviá la documentación al correo institucional para mantener el acceso.
              </p>
            </div>
          </div>
        )}
        <div className="mb-8 border-b border-[#26364d] pb-5 text-center sm:text-left">
          <p className="cop-kicker mb-2">Puesto de trabajo · Accesos habilitados</p>
          <h1 className="text-2xl font-extrabold uppercase tracking-[0.03em] text-white sm:text-3xl">
            Panel de operaciones
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Seleccioná una dependencia funcional para iniciar la jornada.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="cop-module-section">
            <span className="cop-module-section-code">ÁREA 01</span>
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-white">Operaciones</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Carga y seguimiento de información operativa.</p>
            </div>
          </div>

          {tieneAcceso('allanamientos') && (
            <div
              onClick={() => router.push('/allanamientos')}
              className="cop-module-tile group"
            >
              <div className="space-y-4">
                <span className="cop-module-index">OP-01</span>
                <div className="cop-module-icon">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold uppercase tracking-[0.025em] text-white">
                    Allanamientos
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Carga, control de actas, seguimiento semanal y métricas de operativos realizados.
                  </p>
                </div>
              </div>
              <div className="cop-module-action mt-6">
                <span>Ingresar al módulo</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          )}

          {tieneAcceso('deporte') && (
            <div
              onClick={() => router.push('/seguridad-deporte')}
              className="cop-module-tile group"
            >
              <div className="space-y-4">
                <span className="cop-module-index">OP-02</span>
                <div className="cop-module-icon">
                  <PelotaFutbolIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold uppercase tracking-[0.025em] text-white">
                    Eventos Futbolísticos por POLAD
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Registro y seguimiento de eventos futbolísticos, operativos y actas de admisión.
                  </p>
                </div>
              </div>
              <div className="cop-module-action mt-6">
                <span>Ingresar al módulo</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          )}

          {tieneAcceso('contravenciones') && (
            <div
              onClick={() => router.push('/contravenciones')}
              className="cop-module-tile group"
            >
              <div className="space-y-4">
                <span className="cop-module-index">OP-03</span>
                <div className="cop-module-icon">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold uppercase tracking-[0.025em] text-white">
                    Contraventores
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Registro y seguimiento de actas de contravención y faltas jurisdiccionales.
                  </p>
                </div>
              </div>
              <div className="cop-module-action mt-6">
                <span>Ingresar al módulo</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          )}

          {tieneAcceso('motochorros') && (
            <div
              onClick={() => router.push('/motochorros')}
              className="cop-module-tile group"
            >
              <div className="space-y-4">
                <span className="cop-module-index">OP-04</span>
                <div className="cop-module-icon">
                  <Bike className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold uppercase tracking-[0.025em] text-white">
                    Operativo Prevención Motochorros
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Control de interceptaciones, secuestros vehiculares y operativos focalizados.
                  </p>
                </div>
              </div>
              <div className="cop-module-action mt-6">
                <span>Ingresar al módulo</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          )}

          {esAdminOSupervisor && (
            <>
              <div className="cop-module-section">
                <span className="cop-module-section-code">ÁREA 02</span>
                <div>
                  <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-white">Administración</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">Gestión de identidades, destinos y permisos.</p>
                </div>
              </div>
              <div
                onClick={() => router.push('/admin/usuarios')}
                className="cop-module-tile group"
              >
                <div className="space-y-4">
                  <span className="cop-module-index">AD-01</span>
                  <div className="cop-module-icon">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold uppercase tracking-[0.025em] text-white">
                      Gestión de Usuarios
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Administración centralizada de accesos, creación de cuentas y roles del personal.
                    </p>
                  </div>
                </div>
                <div className="cop-module-action mt-6">
                  <span>Acceder a administración</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </>
          )}

          {esAdministrador && (
            <>
              <div className="cop-module-section">
                <span className="cop-module-section-code">ÁREA 03</span>
                <div>
                  <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-white">Control interno</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">Auditoría y trazabilidad reservada del sistema.</p>
                </div>
              </div>
              <div
                onClick={() => router.push('/admin/auditoria')}
                className="cop-module-tile group"
              >
                <div className="space-y-4">
                  <span className="cop-module-index">CI-01</span>
                  <div className="cop-module-icon">
                    <ClipboardCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold uppercase tracking-[0.025em] text-white">
                      Centro de Auditoría
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Trazabilidad central de usuarios, allanamientos y decisiones sobre rendiciones.
                    </p>
                  </div>
                </div>
                <div className="cop-module-action mt-6">
                  <span>Revisar actividad</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </>
          )}

        </div>
      </main>

      {requiereCambioClave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-md overflow-hidden border border-[#33465f] border-t-2 border-t-[#c4a35a] bg-[#071426]">
            <div className="flex items-center gap-3 border-b border-[#26364d] bg-[#050e1c] p-4 px-6">
              <div className="flex h-8 w-8 items-center justify-center border border-[#806c3f] bg-[#071426] text-[#c4a35a]">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-xs text-amber-300 uppercase tracking-wider">
                  Cambio de contraseña obligatorio
                </h2>
                <p className="text-[10px] text-slate-400">Definí una credencial personal para completar la activación.</p>
              </div>
            </div>

            <form onSubmit={handleCambiarPassword} className="p-6 space-y-4">
              {errorClave && (
                <div className="flex items-center gap-2 border border-red-800/80 bg-red-950/40 p-3 text-xs text-red-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorClave}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Nueva Contraseña</label>
                <input
                  required
                  type="password"
                  placeholder="Mínimo 10 caracteres"
                  value={nuevaClave}
                  onChange={(e) => setNuevaClave(e.target.value)}
                  className="w-full border border-[#33465f] bg-[#050e1c] px-3.5 py-2.5 text-xs text-white focus:border-[#c4a35a] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Confirmar Nueva Contraseña</label>
                <input
                  required
                  type="password"
                  placeholder="Repetí tu nueva contraseña"
                  value={confirmarClave}
                  onChange={(e) => setConfirmarClave(e.target.value)}
                  className="w-full border border-[#33465f] bg-[#050e1c] px-3.5 py-2.5 text-xs text-white focus:border-[#c4a35a] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  disabled={guardandoClave}
                  type="submit"
                  className="cop-action-primary w-full justify-center py-2.5"
                >
                  {guardandoClave ? 'Guardando...' : 'Actualizar Contraseña e Ingresar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <InstitutionalDialog
        open={claveActualizada}
        title="Contraseña actualizada"
        description="La nueva credencial quedó registrada correctamente. Ya podés continuar utilizando los módulos habilitados."
        tone="success"
        confirmLabel="Continuar"
        showCancel={false}
        onCancel={() => setClaveActualizada(false)}
        onConfirm={() => setClaveActualizada(false)}
      />

      <footer className="border-t border-[#26364d] bg-[#071426] py-5 text-xs text-slate-500">
        <div className="mx-auto flex max-w-[1320px] flex-col justify-between gap-1 px-6 sm:flex-row sm:items-center">
          <p className="font-bold uppercase tracking-[0.12em] text-slate-400">Dirección Centro de Operaciones Policiales</p>
          <p className="text-[10px]">Plataforma Integral de Gestión · Desarrollo: Emmanuel Machado</p>
        </div>
      </footer>
    </div>
  );
}
