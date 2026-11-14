'use client'

import { useOptimistic } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { SearchButton } from '@/components/search/search-button'
import { CommandSearch } from '@/components/search/command-search'
import { useHeaderHidden } from '@/hooks/use-header-hidden'
import { cn } from '@/lib/utils/cn'
import { isPeriodPath, periodQuery, type Period } from '@/lib/period'
import { useCurrentPeriod, usePeriodPending, usePeriodTransition, useRememberPeriod, useToday } from './period-context'
import { PeriodPicker } from './period-picker'
import { ReadOnlyBadge } from './read-only-guard'
import { SyncButton } from '@/components/sync/sync-button'

/**
 * A period chosen in the picker. Pages without a period (settings, upload...) only remember it,
 * so every page opened from there shows it. On a period page the same page loads with the new
 * period; the page on screen stays (its numbers spin or fade on a slow load) until it arrives (period-context.tsx, PageMain).
 * There the period is remembered inside that transition, not before it: the links that follow
 * it (the tab bar's fetch their pages ahead) change with the new page. Changed at once, they
 * fetched three more pages alongside it, and the month took twice as long to load.
 */
export function changePeriod(
  next: Period,
  deps: {
    pathname: string
    params: Iterable<[string, string]>
    remember: (p: Period) => void
    show: (p: Period) => void
    startPeriod: (fn: () => void) => void
    push: (href: string) => void
  }
) {
  const { pathname, params, remember, show, startPeriod, push } = deps
  if (!isPeriodPath(pathname)) {
    remember(next)
    return
  }
  // Year always written, so "all months" is explicit in the URL
  const sp = new URLSearchParams(periodQuery(next))
  for (const [k, v] of params) if (k !== 'year' && k !== 'month') sp.append(k, v)
  startPeriod(() => {
    // The picker shows it at once (optimistic); the remembered period (and its cookie) moves with the page
    show(next)
    remember(next)
    push(`${pathname}?${sp.toString()}`)
  })
}

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
  const pending = usePeriodPending()

  function update(next: Period) {
    changePeriod(next, { pathname, params, remember, show, startPeriod, push: href => router.push(href, { scroll: false }) })
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
        {/* The picker; the way back to this month is inside its panel */}
        <div className="flex items-center">
          <PeriodPicker period={{ year: shown.year, month: shown.month }} today={today} onChange={update} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <SearchButton />
        </div>
        {/* A period loading: a thin line runs along the bottom edge (globals.css, .period-loading) */}
        <div aria-hidden data-on={pending || undefined} className="period-loading" />
      </header>
      <CommandSearch />
    </>
  )
}
