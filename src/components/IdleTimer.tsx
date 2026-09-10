'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Clock, ShieldAlert } from 'lucide-react'

// Tiempo de inactividad antes de mostrar el aviso (2 minutos)
const INACTIVITY_TIME = 2 * 60 * 1000 
// Tiempo de gracia con el modal abierto antes del cierre definitivo (30 segundos)
const COUNTDOWN_TIME = 30 

export default function IdleTimer() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_TIME)

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const cerrarSesion = async () => {
    setShowModal(false)
    await supabase.auth.signOut()
    router.push('/login')
  }

  const resetearTemporizador = () => {
    if (showModal) return // Si el modal ya está visible, no resetea con movimiento
    
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)

    inactivityTimerRef.current = setTimeout(() => {
      setShowModal(true)
      setTimeLeft(COUNTDOWN_TIME)
    }, INACTIVITY_TIME)
  }

  // Manejo de la cuenta regresiva una vez desplegado el cartel
  useEffect(() => {
    if (showModal) {
      countdownIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current!)
            cerrarSesion()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    }

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    }
  }, [showModal])

  // Detección de eventos de interacción del usuario
  useEffect(() => {
    const eventos = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']

    const handleUserActivity = () => resetearTemporizador()

    eventos.forEach((evento) => window.addEventListener(evento, handleUserActivity))
    resetearTemporizador()

    return () => {
      eventos.forEach((evento) => window.removeEventListener(evento, handleUserActivity))
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    }
  }, [])

  const handleContinuar = () => {
    setShowModal(false)
    resetearTemporizador()
  }

  if (!showModal) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
        <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400">
          <Clock className="w-6 h-6 animate-pulse" />
        </div>

        <div>
          <h3 className="text-lg font-bold text-white">¿Sigue ahí?</h3>
          <p className="text-sm text-slate-400 mt-1">
            Su sesión está a punto de expirar por inactividad. Los datos tipeados se conservan en su borrador local.
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 py-3 rounded-xl">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Cierre de sesión automático en
          </span>
          <span className="text-2xl font-mono font-bold text-amber-400">
            00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
          </span>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={cerrarSesion}
            className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition"
          >
            Cerrar Sesión
          </button>
          <button
            onClick={handleContinuar}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-blue-600/20"
          >
            Continuar Carga
          </button>
        </div>
      </div>
    </div>
  )
}