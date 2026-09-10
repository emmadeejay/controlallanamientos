import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // En Next.js 16+, los orígenes de desarrollo permitidos van en la raíz de la configuración:
  allowedDevOrigins: [
    '192.168.0.240:3000',
    'localhost:3000',
    '0.0.0.0:3000'
  ],
}

export default nextConfig