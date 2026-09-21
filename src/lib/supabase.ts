'use client';

// Compatibilidad temporal: todo el frontend usa ahora el mismo cliente SSR.
// En fases posteriores se reemplazarán los imports antiguos por /supabase/client.
export { createClient, supabase } from '@/lib/supabase/client';
