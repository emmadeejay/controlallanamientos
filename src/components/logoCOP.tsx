// src/components/LogoCOP.tsx
'use client';

import Image from 'next/image';

interface LogoCOPProps {
  className?: string; // Para cambiar el tamaño fácilmente (ej: className="w-10 h-10")
}

export default function LogoCOP({ className = "w-12 h-12" }: LogoCOPProps) {
  // --- REEMPLAZÁ ESTA URL POR LA DE TU SUPABASE STORAGE ---
  const logoUrl = 'https://swcbfpyfissfafxjqjhh.supabase.co/storage/v1/object/public/assets/logo_cop.png'; 

  return (
    <div className={`relative ${className}`}>
      <Image
        src={logoUrl}
        alt="Escudo Institucional COP"
        fill
        className="object-contain"
        priority // Esto ayuda a que cargue rápido en el login
      />
    </div>
  );
}