'use client'

import { useOptimistic } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { SearchButton } from '@/components/search/search-button'
import { CommandSearch } from '@/components/search/command-search'
import { useHeaderHidden } from '@/hooks/use-header-hidden'
import { cn } from '@/lib/utils/cn'
import { isPeriodPath, periodQuery, samePeriod, type Period } from '@/lib/period'
import { useCurrentPeriod, usePeriodTransition, useRememberPeriod, useToday } from './period-context'
import { PeriodPicker } from './period-picker'
import { TodayButton } from './today-button'
import { ReadOnlyBadge } from './read-only-guard'
import { SyncButton } from '@/components/sync/sync-button'

/**
 * Sticky, translucent header: sync at the start, the period picker in the middle, search at the end. It slides
 * up out of the way while scrolling down and comes back on any scroll up
 * (transform only). It stays put while focus is inside it and under
 * reduced motion.
 */
export function Header({ readOnly = false }: { readOnly?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const hidden = useHeaderHidden()

  const remember = useRememberPeriod()
  // The URL's period on a period page, else the remembered one
  const current = useCurrentPeriod()
  // The picker shows the period chosen at once; the URL (and the page) follow when it has loaded
  const [shown, show] = useOptimistic(current)
  const startPeriod = usePeriodTransition()
  const today = useToday()

  function update(next: Period) {
    // Remembered at once (cookie too), so every page opened from here on shows it
    remember(next)
    // Pages without a period (settings, upload...) keep their URL
    if (!isPeriodPath(pathname)) return
    // Year always written, so "all months" is explicit in the URL
    const sp = new URLSearchParams(periodQuery(next))
    for (const [k, v] of params) if (k !== 'year' && k !== 'month') sp.append(k, v)
    // Same page, new period: keep the reader where they were. The page on screen stays,
    // dimmed, until the new one arrives (period-context.tsx, PageMain)
    startPeriod(() => {
      show(next)
      router.push(`${pathname}?${sp.toString()}`, { scroll: false })
    })
  }

  return (
    <>
      <header
        data-hidden={hidden || undefined}
        className={cn(
          // A narrower gap on phones leaves room for the "this month" button at 360px
          'sticky top-0 z-30 grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-4 bar-glass border-b px-4 py-2.5',
          '[@media(prefers-reduced-transparency:reduce)]:bg-card',
          'transition-transform duration-fast ease-ui',
          'data-[hidden]:-translate-y-full focus-within:!translate-y-0',
          'motion-reduce:!translate-y-0 motion-reduce:transition-none'
        )}
      >
        {/* The start column is as wide as the end one, so the period sits in the middle.
            It holds the bank sync (ENG-91); in read-only mode (the demo) it says so instead */}
        <div className="flex min-w-0 items-center">{readOnly ? <ReadOnlyBadge /> : <SyncButton />}</div>
        {/* The picker and, away from this month, the way back to it; the pair stays centred */}
        <div data-period-controls className="flex items-center">
          <PeriodPicker period={{ year: shown.year, month: shown.month }} onChange={update} />
          <TodayButton show={!samePeriod(shown, today)} onClick={() => update(today)} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <SearchButton />
        </div>
      </header>
      <CommandSearch />
    </>
  )
}
