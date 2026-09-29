'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LogOut, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

type Factor = { id: string; friendly_name?: string | null };
type Enrollment = { id: string; qr: string; secret: string };

export default function MfaPanel({ email }: { email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [level, setLevel] = useState<string>('aal1');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [selectedFactor, setSelectedFactor] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = useCallback(async () => {
    const [list, assurance] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (list.error || assurance.error) {
      throw new Error('No se pudo consultar el estado de verificación. Volvé a iniciar sesión.');
    }
    const verified = list.data.totp ?? [];
    setFactors(verified);
    setSelectedFactor(current => verified.some(f => f.id === current) ? current : (verified[0]?.id ?? ''));
    setLevel(assurance.data.currentLevel ?? 'aal1');
  }, []);

  useEffect(() => {
    let active = true;
    refresh().catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'No se pudo consultar la sesión.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  async function enroll() {
    setWorking(true);
    setError('');
    setSuccess('');
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp', friendlyName: `COP ${factors.length + 1}`,
    });
    if (enrollError || !data?.totp) {
      setError(enrollError?.message ?? 'No se pudo iniciar la configuración.');
    } else {
      setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
    }
    setWorking(false);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const factorId = enrollment?.id ?? selectedFactor;
    if (!factorId || !/^\d{6}$/.test(code.trim())) {
      setError('Ingresá los seis dígitos del autenticador.');
      return;
    }
    setWorking(true);
    setError('');
    setSuccess('');
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId, code: code.trim(),
    });
    if (verifyError) {
      setError('El código no pudo verificarse. Comprobá la hora del dispositivo e intentá nuevamente.');
    } else {
      setCode('');
      setEnrollment(null);
      try {
        await refresh();
        setSuccess('Verificación correcta. La sesión actual alcanzó AAL2.');
        window.location.replace('/select-app');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado de la sesión.');
      }
    }
    setWorking(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace('/login');
  }

  const needsChallenge = factors.length > 0 && level !== 'aal2' && !enrollment;

  return (
    <div className="cop-shell min-h-screen px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => router.push('/select-app')} className="cop-action-secondary inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Volver a selección
          </button>
          <button type="button" onClick={logout} className="cop-action-secondary inline-flex items-center gap-2 !text-red-400">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>

        <section className="border border-[#33465f] border-t-2 border-t-[#c4a35a] bg-[#071426] p-6 sm:p-8">
          <div className="flex items-center gap-3 text-[#c4a35a]">
            <ShieldCheck className="h-7 w-7" />
            <p className="cop-kicker">Seguridad de la cuenta administradora</p>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">Verificación en dos pasos</h1>
          <p className="mt-2 text-sm text-slate-400">Cuenta: {email}</p>

          {loading ? <p className="mt-6 text-sm">Consultando el estado de la sesión…</p> : (
            <div className="mt-6 space-y-5">
              {error && <p role="alert" className="border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
              {success && <p role="status" className="border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">{success}</p>}
              <div className="border border-[#33465f] bg-[#050e1c] p-4 text-sm">
                <p>Sesión: <strong className={level === 'aal2' ? 'text-emerald-300' : 'text-amber-300'}>{level === 'aal2' ? 'verificada (AAL2)' : 'pendiente de segundo factor (AAL1)'}</strong></p>
                <p className="mt-1">Autenticadores configurados: {factors.length}</p>
              </div>

              {enrollment ? (
                <div className="space-y-4">
                  <p className="text-sm">Escaneá el código con tu aplicación autenticadora. Luego ingresá el código de seis dígitos.</p>
                  {/* El QR y la clave son credenciales: se muestran solo durante el alta y nunca se registran. */}
                  <img src={enrollment.qr} alt="Código QR para registrar el autenticador" className="h-48 w-48 bg-white p-2" />
                  <p className="break-all text-xs text-slate-400">Si no podés escanearlo, cargá esta clave manualmente: <strong className="text-slate-200">{enrollment.secret}</strong></p>
                </div>
              ) : needsChallenge ? (
                <div className="space-y-3">
                  <p className="text-sm">Ingresá un código de tu autenticador para verificar esta sesión.</p>
                  {factors.length > 1 && (
                    <select value={selectedFactor} onChange={e => setSelectedFactor(e.target.value)} className="w-full border border-[#33465f] bg-[#050e1c] p-3 text-sm">
                      {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Autenticador ${index + 1}`}</option>)}
                    </select>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">{factors.length === 0 ? 'Configurá un autenticador para comenzar.' : 'Podés agregar un segundo dispositivo independiente para recuperar el acceso si perdés el primero.'}</p>
                  <button type="button" disabled={working} onClick={enroll} className="cop-action-secondary disabled:opacity-50">
                    {factors.length === 0 ? 'Configurar autenticador' : 'Agregar otro autenticador'}
                  </button>
                </div>
              )}

              {(enrollment || needsChallenge) && (
                <form onSubmit={verify} className="flex flex-wrap items-end gap-3">
                  <label className="block text-sm">Código del autenticador
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="mt-1 block w-48 border border-[#33465f] bg-[#050e1c] p-3 text-white" />
                  </label>
                  <button type="submit" disabled={working} className="cop-action-secondary disabled:opacity-50">Verificar</button>
                </form>
              )}
              <p className="text-xs text-amber-300">La cuenta administradora necesita verificar un código para acceder a los módulos después de cada nuevo inicio de sesión.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
