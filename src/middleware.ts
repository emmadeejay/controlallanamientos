// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresca la sesión si está por expirar
  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // 1. Si intenta entrar al dashboard sin estar autenticado -> al login
  if (!user && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Si está autenticado, verificamos si requiere cambio de contraseña obligatoria
  if (user && pathname.startsWith('/dashboard')) {
    // Definimos cuál es la ruta permitida para cambiar la clave (ajusta la ruta si es distinta, ej: '/dashboard/cambiar-password')
    const rutaCambioPassword = '/dashboard/cambiar-password' 

    if (pathname !== rutaCambioPassword) {
      // Consultamos el perfil del usuario para ver si requiere el cambio
      const { data: profile } = await supabase
        .from('profiles')
        .select('requiere_cambio_clave')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.requiere_cambio_clave === true) {
        const url = request.nextUrl.clone()
        url.pathname = rutaCambioPassword
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}