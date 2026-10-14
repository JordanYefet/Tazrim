'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { SearchButton } from '@/components/search/search-button'
import { CommandSearch } from '@/components/search/command-search'
import { useHeaderHidden } from '@/hooks/use-header-hidden'
import { cn } from '@/lib/utils/cn'
import { monthsArray } from '@/lib/utils/date'

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

  const now = new Date()
  const year = Number(params.get('year') ?? now.getFullYear())
  const month = params.get('month') ?? ''

  function update(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    if (value === '') {
      sp.delete(key)
    } else {
      sp.set(key, value)
    }
    // Same page, new period: keep the reader where they were
    router.push(`${pathname}?${sp.toString()}`, { scroll: false })
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <>
      <header
        data-hidden={hidden || undefined}
        className={cn(
          'sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-card/80 px-4 py-2.5 backdrop-blur-xl',
          '[@media(prefers-reduced-transparency:reduce)]:bg-card',
          'transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
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
