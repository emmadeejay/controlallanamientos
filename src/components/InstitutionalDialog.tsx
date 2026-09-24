'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react';

export type InstitutionalDialogTone = 'info' | 'warning' | 'danger' | 'success';

type InstitutionalDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  tone?: InstitutionalDialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  showCancel?: boolean;
  showClose?: boolean;
  closeOnEscape?: boolean;
  children?: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

const toneStyles: Record<
  InstitutionalDialogTone,
  {
    eyebrow: string;
    icon: typeof Info;
    iconClass: string;
    confirmClass: string;
  }
> = {
  info: {
    eyebrow: 'Información del sistema',
    icon: Info,
    iconClass: 'border-blue-800/70 bg-blue-950/40 text-blue-400',
    confirmClass: 'border-blue-600 bg-blue-700 hover:bg-blue-600',
  },
  warning: {
    eyebrow: 'Confirmación requerida',
    icon: AlertTriangle,
    iconClass: 'border-amber-800/70 bg-amber-950/40 text-amber-400',
    confirmClass: 'border-amber-600 bg-amber-700 hover:bg-amber-600',
  },
  danger: {
    eyebrow: 'Operación sensible',
    icon: ShieldAlert,
    iconClass: 'border-red-800/70 bg-red-950/40 text-red-400',
    confirmClass: 'border-red-700 bg-red-800 hover:bg-red-700',
  },
  success: {
    eyebrow: 'Operación completada',
    icon: CheckCircle2,
    iconClass: 'border-emerald-800/70 bg-emerald-950/40 text-emerald-400',
    confirmClass: 'border-emerald-700 bg-emerald-800 hover:bg-emerald-700',
  },
};

export default function InstitutionalDialog({
  open,
  title,
  description,
  tone = 'info',
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  loading = false,
  showCancel = true,
  showClose = true,
  closeOnEscape = true,
  children,
  onConfirm,
  onCancel,
}: InstitutionalDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const styles = toneStyles[tone];
  const Icon = styles.icon;

  useEffect(() => {
    if (!open) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      if (showCancel) cancelRef.current?.focus();
      else confirmRef.current?.focus();
    }, 0);

    const cerrarConEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape && !loading) onCancel();
    };
    window.addEventListener('keydown', cerrarConEscape);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', cerrarConEscape);
      document.body.style.overflow = overflowAnterior;
    };
  }, [closeOnEscape, loading, onCancel, open, showCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#02060d]/90 p-4">
      <section
        role={tone === 'danger' || tone === 'warning' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-lg overflow-hidden border border-[#33465f] bg-[#071426] text-slate-100"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#26364d] bg-[#050e1c] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center border ${styles.iconClass}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#c4a35a]">
                {styles.eyebrow}
              </p>
              <h2 id={titleId} className="mt-1 text-sm font-extrabold uppercase tracking-[0.035em] text-white">
                {title}
              </h2>
            </div>
          </div>
          {showClose && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="border border-transparent p-1.5 text-slate-500 transition hover:border-[#26364d] hover:text-white disabled:opacity-40"
              aria-label="Cerrar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-4 px-5 py-5">
          {description && (
            <p id={descriptionId} className="text-sm leading-relaxed text-slate-300">
              {description}
            </p>
          )}
          {children}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#26364d] bg-[#050e1c] px-5 py-4 sm:flex-row sm:justify-end">
          {showCancel && (
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="cop-action-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className={`inline-flex min-h-10 items-center justify-center gap-2 border px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.055em] text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${styles.confirmClass}`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
