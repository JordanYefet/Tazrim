'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, ListFilter, Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { MonthBarsChart } from '@/components/cards/month-bars'
import { Reveal } from '@/components/ui/reveal'
import type { MerchantYear as MerchantYearData } from '@/lib/insights/category-year'

export interface MerchantYearRef {
  source: 'bank' | 'card'
  id: string
  /** The year shown (the row's own year, or the page's) */
  year: number
}

const EMPTY_MONTHS: Record<number, number> = {}

/**
 * A merchant's year, read from /api/insights/merchant-year once `active` is first true:
 * twelve small bars (MonthBarsChart) and a caption with the count and the total. The
 * block keeps its height while loading and on an error, so nothing moves.
 */
export function MerchantYear({ source, id, year, active = true, className }: MerchantYearRef & { active?: boolean; className?: string }) {
  const [data, setData] = useState<MerchantYearData | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  // Read once per row: the request is not repeated while it runs or after it answered
  const requested = useRef(false)

  useEffect(() => {
    if (!active || requested.current) return
    requested.current = true
    let done = false
    const abort = new AbortController()
    setState('loading')
    fetch(`/api/insights/merchant-year?${new URLSearchParams({ source, id, year: String(year) })}`, { signal: abort.signal })
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status))
        setData((await res.json()) as MerchantYearData)
        done = true
        setState('idle')
      })
      .catch(() => {
        if (abort.signal.aborted) return
        requested.current = false
        setState('error')
      })
    return () => {
      abort.abort()
      // Closed mid-request: ask again next time
      if (!done) requested.current = false
    }
  }, [active, source, id, year])

  const caption = data
    ? `${year} · ${data.count === 1 ? 'עסקה אחת' : `${data.count} עסקאות`} · סה״כ ${formatCurrencyWhole(data.total)}`
    : state === 'error'
      ? 'הטעינה נכשלה'
      : 'טוען…'

  return (
    <div className={cn('flex h-28 flex-col', className)} aria-busy={state === 'loading'}>
      <MonthBarsChart values={data?.months ?? EMPTY_MONTHS} tone="neutral" caption={caption} formatValue={formatCurrencyWhole} />
    </div>
  )
}

/**
 * "כל העסקאות מהעסק הזה" under the merchant's year: on a transaction table it filters
 * the table to the merchant (`?merchant=`, the same filter a click on the name sets on
 * desktop; phones have no other way to it); elsewhere (search, a category's year) it
 * is a link to a search for the merchant.
 */
export type MerchantAll = { onClick: () => void } | { href: string }

const ROW =
  'flex min-h-11 w-full items-center gap-3 px-3.5 text-start text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * The transaction window's "העסק הזה" block: a 44px row, "העסק הזה לאורך השנה", that
 * opens the merchant's year in place (Reveal; the year is read on the first opening),
 * and under it, when the window has somewhere to send it, the 44px row "כל העסקאות
 * מהעסק הזה" (`all`).
 */
export function MerchantYearToggle({ all, ...ref }: MerchantYearRef & { all?: MerchantAll }) {
  const [open, setOpen] = useState(false)
  const id = `merchant-year-${ref.source}-${ref.id}`
  return (
    <div className="mt-3 rounded-xl ring-1 ring-inset ring-border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={id}
        className={cn(ROW, all ? 'rounded-t-xl' : 'rounded-xl')}
      >
        <span className="min-w-0 flex-1 font-medium">העסק הזה לאורך השנה</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-base ease-ui', open && 'rotate-180')} aria-hidden />
      </button>
      <Reveal open={open} id={id} className="px-3.5 pb-3.5">
        <MerchantYear {...ref} active={open} />
      </Reveal>
      {all && 'href' in all && (
        <Link href={all.href} className={cn(ROW, 'rounded-b-xl border-t border-border')}>
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 font-medium">כל העסקאות מהעסק הזה</span>
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      )}
      {all && 'onClick' in all && (
        <button type="button" onClick={all.onClick} className={cn(ROW, 'rounded-b-xl border-t border-border')}>
          <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 font-medium">כל העסקאות מהעסק הזה</span>
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      )}
    </div>
  )
}
