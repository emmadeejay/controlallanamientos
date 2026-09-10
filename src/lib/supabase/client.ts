import { createBrowserClient } from '@supabase/ssr'

// Guardamos la instancia globalmente fuera de la función
let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return browserClient
}

// Exportamos también la constante directa para compatibilidad
export const supabase = createClient()