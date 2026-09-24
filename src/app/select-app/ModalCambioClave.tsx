'use client';

import { useState } from 'react';
import { cambiarPasswordObligatorioAction } from '@/app/actions/usuarios';
import { KeyRound, AlertTriangle } from 'lucide-react';
import InstitutionalDialog from '@/components/InstitutionalDialog';

export default function ModalCambioClave() {
  const [open, setOpen] = useState(true);
  const [nuevaClave, setNuevaClave] = useState('');
  const [confirmarClave, setConfirmarClave] = useState('');
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [actualizada, setActualizada] = useState(false);

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
      setOpen(false);
      setActualizada(true);
    } else {
      setErrorClave(res.error || 'Ocurrió un error al actualizar la contraseña.');
    }
  };

  if (actualizada) {
    return (
      <InstitutionalDialog
        open
        title="Contraseña actualizada"
        description="La nueva credencial quedó registrada correctamente. Ya podés continuar utilizando el sistema."
        tone="success"
        confirmLabel="Continuar"
        showCancel={false}
        onCancel={() => setActualizada(false)}
        onConfirm={() => setActualizada(false)}
      />
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f1420] border border-amber-500/40 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-amber-950/40 p-4 border-b border-amber-800/40 flex items-center gap-3 px-6">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-xs text-amber-300 uppercase tracking-wider">
              Cambio de Contraseña Obligatorio
            </h2>
            <p className="text-[10px] text-amber-400/80">Por seguridad, debes definir una clave personal antes de continuar.</p>
          </div>
        </div>

        <form onSubmit={handleCambiarPassword} className="p-6 space-y-4">
          {errorClave && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-400 flex items-center gap-2">
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
              className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
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
              className="w-full px-3.5 py-2.5 bg-[#090c13] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              disabled={guardandoClave}
              type="submit"
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-900/40"
            >
              {guardandoClave ? 'Guardando...' : 'Actualizar Contraseña e Ingresar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
