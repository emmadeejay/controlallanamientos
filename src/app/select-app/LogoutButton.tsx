'use client';

import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';

export default function LogoutButton() {
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.replace('/login');
  };

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-xl transition-all cursor-pointer"
    >
      <LogOut className="w-4 h-4" />
      <span className="hidden sm:inline">Cerrar Sesión</span>
    </button>
  );
}