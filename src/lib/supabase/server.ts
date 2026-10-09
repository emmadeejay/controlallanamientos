import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AuthSessionMissingError } from '@supabase/supabase-js';

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Faltan las variables públicas de Supabase en el servidor.');
  }

  const cookieStore = await cookies();

  const client = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Un Server Component no siempre puede escribir cookies.
          // Las Server Actions y el proxy sí pueden hacerlo.
        }
      },
    },
  });
  const getUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = async (jwt?: string) => {
    const result = await getUser(jwt);
    if (!result.data.user || result.error) return result;
    const { data, error } = await client.rpc('estado_sesion_actual');
    if (error || data?.vigente !== true) {
      return { data: { user: null }, error: new AuthSessionMissingError() };
    }
    return result;
  };
  return client;
}
