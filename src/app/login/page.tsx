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
    <div className="cop-shell flex min-h-screen flex-col text-slate-100">
      <header className="cop-command-header relative z-10">
        <div className="mx-auto flex min-h-[76px] w-full max-w-[1500px] items-center gap-3 px-5 sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center border-r border-[#26364d] pr-3">
            <Image src="/logo_cop.png" alt="Escudo COP" width={48} height={48} priority />
          </div>
          <div>
            <p className="hidden text-[14px] font-extrabold tracking-[0.035em] text-white sm:block lg:text-[15px]">
              PLATAFORMA INTEGRAL DE GESTIÓN COP
            </p>
            <p className="text-sm font-extrabold tracking-[0.08em] text-white sm:hidden">GESTIÓN COP</p>
            <p className="cop-kicker mt-1 hidden sm:block">Dirección Centro de Operaciones Policiales</p>
          </div>
        </div>
      </header>

      <main className="grid flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(430px,0.85fr)]">
        <section className="hidden border-r border-[#26364d] px-10 py-12 lg:flex lg:items-end xl:px-16">
          <div className="max-w-2xl pb-12">
            <p className="cop-kicker mb-4">Sistema institucional · Acceso restringido</p>
            <h1 className="max-w-xl text-4xl font-black uppercase leading-[1.08] tracking-[0.02em] text-white xl:text-5xl">
              Información operativa segura, consolidada y trazable.
            </h1>
            <div className="mt-8 grid max-w-xl grid-cols-3 border-y border-[#26364d] py-4 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
              <span>Acceso por rol</span>
              <span className="border-x border-[#26364d] px-4 text-center">Auditoría activa</span>
              <span className="text-right">Datos protegidos</span>
            </div>
          </div>
        </section>

        <section className="cop-login-panel flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 border-b border-[#26364d] pb-5">
              <p className="cop-kicker mb-2">Credenciales institucionales</p>
              <h2 className="text-2xl font-black uppercase tracking-[0.04em] text-white">Iniciar sesión</h2>
              <p className="mt-2 text-sm text-slate-400">Ingresá con la cuenta asignada por la oficina COP.</p>
            </div>

            {error && (
              <div className="mb-6 border border-red-800/80 bg-red-950/50 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                  Correo electrónico
                </label>
                <div className="relative flex items-center">
                  <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@correo.com"
                    autoComplete="email"
                    className="w-full rounded-[4px] border border-[#26364d] bg-[#050e1c] py-3 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-[#c4a35a]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                  Contraseña
                </label>
                <div className="relative flex items-center">
                  <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full rounded-[4px] border border-[#26364d] bg-[#050e1c] py-3 pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-[#c4a35a]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 cursor-pointer p-1 text-slate-500 transition hover:text-slate-300"
                    title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-blue-400/30 bg-[#2f6fbe] px-4 py-3 text-xs font-extrabold uppercase tracking-[0.09em] text-white transition hover:bg-[#387dce] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /><span>Verificando...</span></>
                ) : (
                  <><span>Ingresar al sistema</span><ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-[#26364d] pt-5 text-center">
              <button
                type="button"
                onClick={() => {
                  setEmailReset(email)
                  setMensajeReset(null)
                  setModalReset(true)
                }}
                className="cursor-pointer text-xs font-semibold text-slate-400 underline decoration-slate-700 underline-offset-4 transition hover:text-[#c4a35a]"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Modal para Recuperar Contraseña */}
      {modalReset && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm space-y-4 rounded-[6px] border border-[#26364d] bg-[#071426] p-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Recuperar contraseña
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
                className="w-full rounded-[4px] border border-[#26364d] bg-[#050e1c] py-2.5 pl-10 pr-4 text-xs text-white outline-none transition placeholder:text-slate-700 focus:border-[#c4a35a]"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalReset(false)}
                  className="flex-1 cursor-pointer rounded-[4px] border border-[#26364d] bg-transparent px-4 py-2 text-xs font-semibold uppercase text-slate-400 transition hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingReset}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[4px] bg-[#2f6fbe] px-4 py-2 text-xs font-semibold uppercase text-white transition hover:bg-[#387dce] disabled:opacity-50"
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
      <footer className="border-t border-[#26364d] bg-[#071426] py-4 text-[10px] text-slate-500">
        <div className="mx-auto flex max-w-[1500px] flex-col justify-between gap-1 px-5 sm:flex-row sm:items-center sm:px-8">
          <span className="font-bold uppercase tracking-[0.12em] text-slate-400">Dirección Centro de Operaciones Policiales</span>
          <span>Plataforma Integral de Gestión · Desarrollo: Emmanuel Machado</span>
        </div>
      </footer>
    </div>
  )
}
