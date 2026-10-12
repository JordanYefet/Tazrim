import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import { Providers } from './providers'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'

export const metadata: Metadata = {
  title: 'תזרים',
  description: 'ניהול פיננסי אישי',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <Suspense fallback={null}><Header /></Suspense>
              <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
                {children}
              </main>
            </div>
          </div>
          <BottomNav />
        </Providers>
      </body>
    </html>
  )
}
