import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="cop-institutional-ui bg-[#07090e] antialiased">
        {children}
      </body>
    </html>
  );
}
