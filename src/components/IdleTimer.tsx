'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Clock } from 'lucide-react'
import InstitutionalDialog from '@/components/InstitutionalDialog'

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
    <InstitutionalDialog
      open
      title="Sesión próxima a vencer"
      description="La sesión está a punto de finalizar por inactividad. Los datos escritos se conservan en el borrador local."
      tone="warning"
      confirmLabel="Continuar sesión"
      cancelLabel="Cerrar sesión"
      showClose={false}
      closeOnEscape={false}
      onCancel={cerrarSesion}
      onConfirm={handleContinuar}
    >
      <div className="flex items-center justify-between gap-4 border border-[#26364d] bg-[#050e1c] px-4 py-3">
        <span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          <Clock className="h-4 w-4 text-amber-400" /> Cierre automático
        </span>
        <span className="font-mono text-xl font-bold text-amber-400">
          00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
        </span>
      </div>
    </InstitutionalDialog>
  )
}
