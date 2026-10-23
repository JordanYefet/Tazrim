'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { SearchButton } from '@/components/search/search-button'
import { CommandSearch } from '@/components/search/command-search'
import { useHeaderHidden } from '@/hooks/use-header-hidden'
import { cn } from '@/lib/utils/cn'
import { isPeriodPath, periodQuery, type Period } from '@/lib/period'
import { useCurrentPeriod, useRememberPeriod } from './period-context'
import { PeriodPicker } from './period-picker'
import { ReadOnlyBadge } from './read-only-guard'

/**
 * Sticky, translucent header: the period picker in the middle, search at the end. It slides
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

  function update(next: Period) {
    // Remembered at once (cookie too), so every page opened from here on shows it
    remember(next)
    // Pages without a period (settings, upload...) keep their URL
    if (!isPeriodPath(pathname)) return
    // Year always written, so "all months" is explicit in the URL
    const sp = new URLSearchParams(periodQuery(next))
    for (const [k, v] of params) if (k !== 'year' && k !== 'month') sp.append(k, v)
    // Same page, new period: keep the reader where they were
    router.push(`${pathname}?${sp.toString()}`, { scroll: false })
  }

  return (
    <>
      <header
        data-hidden={hidden || undefined}
        className={cn(
          'sticky top-0 z-30 grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 bar-glass border-b px-4 py-2.5',
          '[@media(prefers-reduced-transparency:reduce)]:bg-card',
          'transition-transform duration-fast ease-ui',
          'data-[hidden]:-translate-y-full focus-within:!translate-y-0',
          'motion-reduce:!translate-y-0 motion-reduce:transition-none'
        )}
      >
        {/* The start column is as wide as the end one, so the period sits in the middle;
            in read-only mode (the demo) it says so */}
        <div className="flex min-w-0 items-center">{readOnly && <ReadOnlyBadge />}</div>
        <PeriodPicker period={{ year: current.year, month: current.month }} onChange={update} />

        <div className="flex items-center justify-end gap-2">
          <SearchButton />
        </div>
      </header>
      <CommandSearch />
    </>
  )
}
