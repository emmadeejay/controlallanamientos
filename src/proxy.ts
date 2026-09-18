import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Actualiza las cookies en la request actual
          cookiesToSet.forEach(({ name, value}) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          // Actualiza las cookies en la respuesta que va al navegador
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // auth.getUser() es clave: valida el token en el servidor de Supabase, no solo localmente
  const { data: { user } } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');
  // Define las rutas que requieren sesión obligatoria
  const isProtectedRoute = 
    request.nextUrl.pathname.startsWith('/admin') || 
    request.nextUrl.pathname.startsWith('/allanamientos') || 
    request.nextUrl.pathname.startsWith('/select-app');

  // Si intenta acceder a una ruta protegida sin sesión real, se expulsa
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Si ya tiene sesión y entra al login, se redirige al selector
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/select-app';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Ignora rutas estáticas, imágenes y llamadas internas de Next.js
     * para no consumir peticiones de Supabase en archivos inútiles.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};