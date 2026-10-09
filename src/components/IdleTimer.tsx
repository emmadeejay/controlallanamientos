'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import InstitutionalDialog from '@/components/InstitutionalDialog';

const IDLE_MS = 20 * 60 * 1000;
const WARNING_MS = 60 * 1000;

export default function IdleTimer() {
  const [warning, setWarning] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [closing, setClosing] = useState(false);
  const [failure, setFailure] = useState(false);
  const continueRef = useRef<() => void>(() => {});
  const closeRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false, initialized = false, warningOpen = false, ending = false, closeFailed = false;
    let sessionId: string | null = null;
    let lastActivity = 0, clockOffset = 0, lastSent = 0;
    let pendingTouch: ReturnType<typeof setTimeout> | undefined;
    const now = () => Date.now() + clockOffset;
    const key = () => 'cop-idle:' + sessionId;
    try { localStorage.removeItem('borrador_nuevo_allanamiento'); } catch { /* El cierre no depende del almacenamiento local. */ }

    async function logout() {
      if (ending || disposed) return;
      ending = true;
      closeFailed = false;
      setClosing(true);
      setFailure(false);
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (disposed) return;
      if (error) {
        ending = false;
        closeFailed = true;
        setClosing(false);
        setFailure(true);
        return;
      }
      window.location.replace('/login?motivo=inactividad');
    }
    function checkDeadline() {
      if (!initialized || ending || disposed) return;
      const remaining = IDLE_MS - (now() - lastActivity);
      if (remaining <= 0) { void logout(); return; }
      const show = remaining <= WARNING_MS;
      if (show !== warningOpen) { warningOpen = show; setWarning(show); }
      if (show) setSeconds(Math.ceil(remaining / 1000));
    }
    async function readState() {
      const currentId = sessionId;
      if (!currentId || ending) return;
      const { data, error } = await supabase.rpc('estado_sesion_actual');
      if (disposed || sessionId !== currentId) return;
      if (error) {
        if (!initialized) void logout();
        else checkDeadline();
        return;
      }
      if (data?.vigente !== true) { void logout(); return; }
      clockOffset = Date.parse(data.servidor_ahora) - Date.now();
      const timestamp = Date.parse(data.ultima_actividad);
      if (!Number.isFinite(timestamp)) { void logout(); return; }
      lastActivity = Math.max(lastActivity, timestamp);
      initialized = true;
      checkDeadline();
    }
    async function initialize(session: Session | null) {
      if (disposed) return;
      if (!session) {
        const hadSession = sessionId !== null;
        initialized = false;
        sessionId = null;
        setWarning(false);
        if (hadSession) window.location.replace('/login');
        return;
      }
      let id: string;
      try { id = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id; }
      catch { void logout(); return; }
      if (!id) { void logout(); return; }
      // TOKEN_REFRESHED y eventos internos no constituyen actividad humana.
      if (id === sessionId) return;
      sessionId = id;
      lastActivity = 0;
      initialized = false;
      await readState();
    }
    async function sendActivity(timestamp: number) {
      if (!sessionId || ending) return;
      const currentId = sessionId;
      lastSent = Date.now();
      const { error } = await supabase.rpc('registrar_actividad_sesion', {
        p_ocurrio_at: new Date(timestamp).toISOString(),
      });
      if (disposed || sessionId !== currentId) return;
      if (error?.code === '42501') void logout();
    }
    function activity() {
      if (!initialized || ending || disposed) return;
      // Una interacción después del plazo no revive una sesión vencida.
      if (now() - lastActivity >= IDLE_MS) { void logout(); return; }
      lastActivity = now();
      warningOpen = false;
      setWarning(false);
      try { localStorage.setItem(key(), String(lastActivity)); } catch { /* La DB conserva el plazo autoritativo. */ }
      if (Date.now() - lastSent >= 30_000) void sendActivity(lastActivity);
      if (pendingTouch) clearTimeout(pendingTouch);
      // El envío conserva la fecha del evento; el timer no inventa actividad.
      const occurredAt = lastActivity;
      pendingTouch = setTimeout(() => void sendActivity(occurredAt), 500);
    }
    function humanEvent(event: Event) {
      if (event.isTrusted && !warningOpen) activity();
    }
    function storageEvent(event: StorageEvent) {
      if (!sessionId || event.key !== key()) return;
      const timestamp = Number(event.newValue);
      if (Number.isFinite(timestamp) && timestamp <= now() + 5000) {
        lastActivity = Math.max(lastActivity, timestamp);
        checkDeadline();
      }
    }
    function resumed() { checkDeadline(); void readState(); }
    function online() { if (closeFailed || (initialized && now() - lastActivity >= IDLE_MS)) void logout(); }
    continueRef.current = activity;
    closeRef.current = () => void logout();
    const events = ['mousemove', 'keydown', 'click', 'wheel', 'touchstart'];
    events.forEach(name => window.addEventListener(name, humanEvent, { passive: true }));
    window.addEventListener('storage', storageEvent);
    window.addEventListener('pageshow', resumed);
    window.addEventListener('focus', resumed);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', resumed);
    const tick = setInterval(checkDeadline, 1000);
    const verify = setInterval(() => void readState(), 60_000);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void initialize(session), 0);
    });
    void supabase.auth.getSession().then(({ data }) => initialize(data.session));
    return () => {
      disposed = true;
      clearInterval(tick);
      clearInterval(verify);
      if (pendingTouch) clearTimeout(pendingTouch);
      listener.subscription.unsubscribe();
      events.forEach(name => window.removeEventListener(name, humanEvent));
      window.removeEventListener('storage', storageEvent);
      window.removeEventListener('pageshow', resumed);
      window.removeEventListener('focus', resumed);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', resumed);
    };
  }, []);

  const confirm = useCallback(() => failure ? closeRef.current() : continueRef.current(), [failure]);
  const cancel = useCallback(() => closeRef.current(), []);
  if (!warning && !closing && !failure) return null;
  return <InstitutionalDialog
    open
    title={failure ? 'Cierre pendiente' : 'Sesión próxima a vencer'}
    description={failure
      ? 'No se pudo confirmar el cierre de sesión. Verificá la conexión y reintentá. La sesión vencida no permite operaciones.'
      : 'Tu sesión está por cerrarse por inactividad. Los datos del formulario que no hayas guardado se perderán.'}
    tone="warning"
    confirmLabel={failure ? 'Reintentar cierre' : 'CONTINUAR SESIÓN'}
    cancelLabel="CERRAR SESIÓN"
    loading={closing}
    showCancel={!failure}
    showClose={false}
    closeOnEscape={false}
    onConfirm={confirm}
    onCancel={cancel}
  >{!failure && <p className="font-mono text-xl text-amber-400">Cierre en {seconds} segundos</p>}</InstitutionalDialog>;
}
