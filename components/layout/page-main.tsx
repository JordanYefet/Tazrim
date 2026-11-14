'use client'

import { usePeriodPending } from './period-context'

/**
 * The page's <main>. While a period or scope navigation is in flight
 * (period-context.tsx) the page on screen stays, in place: after 400 ms its rolling
 * numbers spin and its plain figures fade (globals.css, `main[data-pending]`), so
 * last month's figures never read as the new month's. Nothing goes blank, nothing
 * moves; an ordinary month change shows nothing but the roll into the new numbers.
 */
export function PageMain({ className, children }: { className?: string; children: React.ReactNode }) {
  const pending = usePeriodPending()
  return (
    <main
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
      className={className}
    >
      {children}
    </main>
  )
}
