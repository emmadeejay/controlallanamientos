'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        throw new Error('Credenciales inválidas. Por favor verifique su correo y contraseña.')
      }

      if (data.user) {
        // Redirigir al selector de módulos en lugar de ir directo a allanamientos
        router.push('/select-app')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between items-center p-4">
      {/* Contenedor central vacio para empujar el formulario al centro */}
      <div />

      {/* Tarjeta de Login */}
      <div className="w-full max-w-md bg-[#0f172a]/70 border border-slate-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
        
        {/* Escudo y Títulos */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-20 h-20 relative mb-4">
            <Image
              src="/logo_cop.png"
              alt="COP Escudo"
              width={80}
              height={80}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-xl font-bold text-white tracking-wide">
            Plataforma de Estadísticas COP
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Sistema Integral de Gestión
          </p>
        </div>

        {/* Mensaje de error */}
        {error && (
          <div className="mb-6 bg-red-950/60 border border-red-800/80 text-red-300 text-xs p-3 rounded-xl text-center">
            {error}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleLogin} className="space-y-5">
          
          {/* Campo Correo */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 tracking-wider uppercase mb-2">
              Correo
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@cop.gob.ar"
                className="w-full bg-[#090d16] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Campo Contraseña con Ojito */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 tracking-wider uppercase mb-2">
              Contraseña
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#090d16] border border-slate-800 rounded-xl pl-10 pr-11 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 p-1 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Botón de Ingreso */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl text-sm transition duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Iniciando sesión...</span>
              </>
            ) : (
              <>
                <span>INGRESAR AL SISTEMA</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Link Olvidaste contraseña */}
        <div className="mt-6 text-center">
          <a
            href="#"
            className="text-xs text-slate-400 hover:text-blue-400 underline transition"
          >
            ¿Olvidaste tu contraseña?
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500">
        Diseñado por <span className="text-blue-400 font-semibold">EMMANUEL MACHADO</span>
      </footer>
    </div>
  )
}