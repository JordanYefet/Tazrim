'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { SearchButton } from '@/components/search/search-button'
import { CommandSearch } from '@/components/search/command-search'
import { useHeaderHidden } from '@/hooks/use-header-hidden'
import { cn } from '@/lib/utils/cn'
import { monthsArray } from '@/lib/utils/date'
import { isPeriodPath, periodQuery, type Period } from '@/lib/period'
import { useCurrentPeriod, useRememberPeriod } from './period-context'

const MONTHS = monthsArray()

/**
 * Sticky, translucent header with the period selects and search. It slides
 * up out of the way while scrolling down and comes back on any scroll up
 * (transform only). It stays put while focus is inside it and under
 * reduced motion.
 */
export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const hidden = useHeaderHidden()

  const remember = useRememberPeriod()
  // The URL's period on a period page, else the remembered one
  const current = useCurrentPeriod()
  const year = current.year
  const month = current.month ? String(current.month) : ''

  function update(key: 'year' | 'month', value: string) {
    const next: Period = {
      year: key === 'year' ? Number(value) : year,
      month: key === 'month' ? (value ? Number(value) : undefined) : current.month,
    }
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

  const now = new Date()
  // The last five years, plus a remembered or linked year further back
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  if (!years.includes(year)) {
    years.push(year)
    years.sort((a, b) => b - a)
  }

  return (
    <>
      <header
        data-hidden={hidden || undefined}
        className={cn(
          'sticky top-0 z-30 flex h-14 items-center justify-between gap-4 bar-glass border-b px-4 py-2.5',
          '[@media(prefers-reduced-transparency:reduce)]:bg-card',
          'transition-transform duration-fast ease-ui',
          'data-[hidden]:-translate-y-full focus-within:!translate-y-0',
          'motion-reduce:!translate-y-0 motion-reduce:transition-none'
        )}
      >
        <div className="flex items-center gap-2">
          <select
            aria-label="חודש"
            value={month}
            onChange={e => update('month', e.target.value)}
          >
            <option value="">כל החודשים</option>
            {MONTHS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            aria-label="שנה"
            value={year}
            onChange={e => update('year', e.target.value)}
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <SearchButton />
        </div>
      </header>
      <CommandSearch />
    </>
  )
}
