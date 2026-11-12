'use client'

import { cn } from '@/lib/utils/cn'
import { usePeriodPending } from './period-context'

/**
 * The page's <main>. While a period or scope navigation is in flight
 * (period-context.tsx) the page on screen stays and dims a little, in place, and
 * comes back when the next page has arrived: nothing goes blank, nothing moves.
 * The dim waits a beat (`--motion-quick`), so a page the browser already holds
 * swaps without a blink; it clears at once.
 */
export function PageMain({ className, children }: { className?: string; children: React.ReactNode }) {
  const pending = usePeriodPending()
  return (
    <main
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
      className={cn(
        className,
        'transition-opacity duration-fast ease-ui motion-reduce:transition-none',
        pending ? 'opacity-60 delay-[var(--motion-quick)]' : 'delay-0'
      )}
    >
      {children}
    </main>
  )
}
