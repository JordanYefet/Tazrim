import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The bank-sync scraper (ENG-91) drives a browser through puppeteer: required at run time, never bundled
  // The browser keeps pages it has shown for five minutes, so going back to a tab is
  // instant. The data only changes on a write: components/layout/fresh-data.tsx drops
  // the kept pages after every write to the API and when the app comes back from the
  // background
  experimental: { staleTimes: { dynamic: 300, static: 300 } },
  serverExternalPackages: ['@prisma/client', 'prisma', 'israeli-bank-scrapers', 'puppeteer'],
  // The Docker build sets TAZRIM_STANDALONE=1 for a self-contained server in
  // .next/standalone; local `npm run build` + `npm start` stay as they were.
  ...(process.env.TAZRIM_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  // The live demo on Vercel: the demo database its build made ships with every
  // server function (lib/db/demo-database.ts copies it to the temp folder)
  ...(process.env.VERCEL ? { outputFileTracingIncludes: { '/**': ['./prisma/demo.db'] } } : {}),
}

export default nextConfig
