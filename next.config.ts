import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', 'prisma'],
  // The Docker build sets TAZRIM_STANDALONE=1 for a self-contained server in
  // .next/standalone; local `npm run build` + `npm start` stay as they were.
  ...(process.env.TAZRIM_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
}

export default nextConfig
