'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, X } from 'lucide-react'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Estados para Recuperar Contraseña
  const [modalReset, setModalReset] = useState(false)
  const [emailReset, setEmailReset] = useState('')
  const [loadingReset, setLoadingReset] = useState(false)
  const [mensajeReset, setMensajeReset] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError) {
        throw new Error('Credenciales inválidas. Por favor verifique su correo y contraseña.')
      }

      if (data.user) {
        router.push('/select-app')
        router.refresh()
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Error al iniciar sesión')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRecuperarPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoadingReset(true)
    setMensajeReset(null)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailReset, {
        redirectTo: `${window.location.origin}/auth/actualizar-password`,
      })

      if (resetError) {
        throw new Error(resetError.message)
      }

      setMensajeReset({
        tipo: 'ok',
        texto: 'Se ha enviado un enlace de recuperación a tu correo electrónico.',
      })

      // Cierra el modal automáticamente pasados 3 segundos
      setTimeout(() => {
        setModalReset(false)
      }, 3000)

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'No se pudo enviar el correo de recuperación.'
      setMensajeReset({
        tipo: 'error',
        texto: errorMsg,
      })
    } finally {
      setLoadingReset(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between items-center p-4">
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

          {/* Campo Contraseña */}
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
          <button
            type="button"
            onClick={() => {
              setEmailReset(email)
              setMensajeReset(null)
              setModalReset(true)
            }}
            className="text-xs text-slate-400 hover:text-blue-400 underline transition cursor-pointer"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>

      {/* Modal para Recuperar Contraseña */}
      {modalReset && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Recuperar Contraseña
              </h2>
              <button
                type="button"
                onClick={() => setModalReset(false)}
                className="text-slate-500 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Ingresá tu correo electrónico y te enviaremos las instrucciones para restablecer tu contraseña.
            </p>

            {mensajeReset && (
              <div
                className={`p-3 rounded-xl text-xs border flex items-center gap-2 ${
                  mensajeReset.tipo === 'ok'
                    ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                    : 'bg-red-950/60 border-red-800/80 text-red-300'
                }`}
              >
                {mensajeReset.tipo === 'ok' && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
                <span>{mensajeReset.texto}</span>
              </div>
            )}

            <form onSubmit={handleRecuperarPassword} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Correo Electrónico
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={emailReset}
                    onChange={(e) => setEmailReset(e.target.value)}
                    placeholder="ejemplo@cop.gob.ar"
                    className="w-full bg-[#090d16] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalReset(false)}
                  className="flex-1 px-4 py-2 text-xs font-semibold uppercase text-slate-400 hover:text-white bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingReset}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs uppercase transition shadow-lg shadow-blue-600/25 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loadingReset ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Enviar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500">
        Diseñado por <span className="text-blue-400 font-semibold">EMMANUEL MACHADO</span>
      </footer>
    </div>
  )
}