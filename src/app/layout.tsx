import Image from 'next/image';

export default function HeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between">
      {/* Header Institucional */}
      <header className="w-full border-b border-slate-800/80 bg-[#0c0f17]/90 backdrop-blur-md px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 relative flex-shrink-0">
            <Image
              src="/logo_cop.png"
              alt="Logo C.O.P"
              width={36}
              height={36}
              className="object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide uppercase">
              SISTEMA DE ESTADISTICAS COP
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">
              PLATAFORMA INTEGRAL DE GESTIÓN
            </p>
          </div>
        </div>

        {/* Sección Derecha - Sesión / Botones */}
        <div className="flex items-center gap-3 text-xs">
          {/* Aquí podés renderizar los componentes del usuario / logout */}
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1">{children}</main>
    </div>
  );
}