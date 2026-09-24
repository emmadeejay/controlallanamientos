import './globals.css';
import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="cop-institutional-ui overflow-x-hidden bg-[#07090e] antialiased">
        {children}
      </body>
    </html>
  );
}
