import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import './globals.css'
import { Providers } from './providers'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'
import { NavSectionsProvider } from '@/components/layout/nav-context'
import { listAccounts } from '@/lib/db/accounts'
import {
  SECTIONS_COOKIE,
  SIDEBAR_COOKIE,
  buildNavSections,
  parseClosedSections,
  parseSidebarCollapsed,
} from '@/lib/nav/state'

export const metadata: Metadata = {
  title: 'תזרים',
  description: 'ניהול פיננסי אישי',
}

// viewport-fit=cover so env(safe-area-inset-*) is non-zero on phones with a home indicator
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The sidebar mode comes from a cookie so the first paint already has the right width
  const [jar, accounts] = await Promise.all([cookies(), listAccounts()])
  const sections = buildNavSections(accounts)

  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <NavSectionsProvider sections={sections}>
            <div className="flex min-h-screen">
              <Sidebar
                initialCollapsed={parseSidebarCollapsed(jar.get(SIDEBAR_COOKIE)?.value)}
                initialClosed={parseClosedSections(jar.get(SECTIONS_COOKIE)?.value)}
              />
              <div className="flex flex-col flex-1 min-w-0">
                <Suspense fallback={<div className="h-14 border-b bg-card" />}><Header /></Suspense>
                <main className="flex-1 p-4 md:p-6 pb-[calc(5.75rem+max(0.75rem,env(safe-area-inset-bottom)))] md:pb-6">
                  {children}
                </main>
              </div>
            </div>
            <BottomNav />
          </NavSectionsProvider>
        </Providers>
      </body>
    </html>
  )
}
