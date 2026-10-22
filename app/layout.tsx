import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import './globals.css'
import { heeboHebrew, heeboLatin } from './fonts'
import { Providers } from './providers'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'
import { NavSectionsProvider } from '@/components/layout/nav-context'
import { PeriodProvider } from '@/components/layout/period-context'
import { getPeriod } from '@/lib/period-server'
import { listAccounts } from '@/lib/db/accounts'
import { BRAND } from '@/lib/brand/colors'
import { BackgroundProvider } from '@/components/background/background-provider'
import { BACKGROUND_COOKIE, backgroundHtmlAttributes, backgroundHtmlStyle, parseBackgroundCookie } from '@/lib/background/setting'
import { tileStyle, tileUrl } from '@/lib/background/tile-svg'
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
  // Installed on an iPhone home screen: opens full screen, with the system status bar
  appleWebApp: { capable: true, title: 'תזרים', statusBarStyle: 'default' },
}

// viewport-fit=cover so env(safe-area-inset-*) is non-zero on phones with a home indicator.
// themeColor tints the installed app's title bar / phone status bar to match the header (--card).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND.lightCard },
    { media: '(prefers-color-scheme: dark)', color: BRAND.darkCard },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The sidebar mode comes from a cookie so the first paint already has the right width
  // The remembered period too (ENG-63): links carry it from the first paint
  const [jar, accounts, remembered] = await Promise.all([cookies(), listAccounts(), getPeriod(null)])
  const sections = buildNavSections(accounts)
  const initialPeriod = remembered.month ? { year: remembered.year, month: remembered.month } : { year: remembered.year }
  // The page background (ENG-72), also from a cookie: the first paint has the right one
  const background = parseBackgroundCookie(jar.get(BACKGROUND_COOKIE)?.value)

  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heeboHebrew.variable} ${heeboLatin.variable}`}
      {...backgroundHtmlAttributes(background)}
      style={{ ...backgroundHtmlStyle(background), ...tileStyle(background, tileUrl) } as React.CSSProperties}
      suppressHydrationWarning
    >
      <body>
        <Providers>
          <BackgroundProvider initial={background}>
          <PeriodProvider initial={initialPeriod}>
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
          </PeriodProvider>
          </BackgroundProvider>
        </Providers>
      </body>
    </html>
  )
}
