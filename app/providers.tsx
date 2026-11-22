'use client'

import { ThemeProvider } from 'next-themes'
import { VaultUnlockHost } from '@/components/vault/unlock'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <VaultUnlockHost />
    </ThemeProvider>
  )
}
