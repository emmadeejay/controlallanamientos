import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://swcbfpyfissfafxjqjhh.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Declaración global para evitar múltiples instancias en Hot Reload / Client
declare global {
  var supabaseSingleton: SupabaseClient | undefined;
}

export const supabase =
  globalThis.supabaseSingleton ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.supabaseSingleton = supabase;
}