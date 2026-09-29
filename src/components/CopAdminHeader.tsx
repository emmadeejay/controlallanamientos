'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Grid, LogOut, Shield, User } from 'lucide-react';

type Props = {
  active: 'usuarios' | 'auditoria';
  email: string;
  role: string;
  onLogout: () => void;
  loggingOut?: boolean;
};

export default function CopAdminHeader({ active, email, role, onLogout, loggingOut = false }: Props) {
  return (
    <>
      <header className="cop-command-header sticky top-0 z-50">
        <div className="mx-auto flex min-h-[76px] max-w-[1800px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center border-r border-[#26364d] pr-3">
                <Image src="/logo_cop.png" alt="Logo COP" width={36} height={36} className="h-auto w-9 object-contain" priority />
              </div>
              <div className="hidden sm:block">
                <span className="block text-[15px] font-extrabold leading-none tracking-[0.04em] text-white">{active === 'usuarios' ? 'GESTIÓN DE USUARIOS' : 'AUDITORÍA COP'}</span>
                <span className="cop-kicker mt-1.5 block">Dirección Centro de Operaciones Policiales</span>
              </div>
            </div>
            <Link href="/select-app" className="border border-[#26364d] p-2 text-slate-400 transition hover:border-[#806c3f] hover:text-[#c4a35a]" title="Menú principal de apps" aria-label="Menú principal de apps">
              <Grid className="h-4 w-4" />
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="cop-session-block hidden w-[clamp(360px,30vw,510px)] shrink-0 min-[1500px]:flex">
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-xs text-slate-300">
                <User className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                <span className="block max-w-[240px] truncate font-semibold">{email}</span>
              </div>
              <div className="cop-session-role"><Shield className="h-3 w-3" /><span>{role}</span></div>
            </div>
            <button type="button" onClick={onLogout} disabled={loggingOut} className="flex cursor-pointer items-center gap-2 border border-red-900/70 bg-red-950/20 px-3 py-2 text-xs font-bold uppercase tracking-wide text-red-400 transition hover:bg-red-950/50 disabled:opacity-50" title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">{loggingOut ? 'Cerrando...' : 'Cerrar sesión'}</span>
            </button>
          </div>
        </div>
      </header>
      <div className="border-b border-[#26364d] bg-[#071426] px-4 py-2 min-[1500px]:hidden sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 text-[10px]">
          <span className="flex min-w-0 items-center gap-2 text-slate-300" title={email}><User className="h-3.5 w-3.5 shrink-0 text-blue-400" /><span className="truncate font-semibold">{email}</span></span>
          <span className="flex shrink-0 items-center gap-1.5 font-extrabold uppercase tracking-[0.07em] text-[#c4a35a]"><Shield className="h-3 w-3" />{role}</span>
        </div>
      </div>
    </>
  );
}
