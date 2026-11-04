'use client'

import Link from 'next/link'
import { Pencil, TriangleAlert } from 'lucide-react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { monthLabel, tightLine } from '@/lib/insights/projection-format'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { cn } from '@/lib/utils/cn'
import { useSelectedMonth } from './selected-month'

/** One fact row: the label (and any note or link) at the start, the number alone at the end, so the numbers line up */
function Fact({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}

/** A signed amount in the income or expense colour */
function Signed({ value }: { value: number }) {
  return (
    <span className={value >= 0 ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'} dir="ltr">
      {value >= 0 ? '+' : '−'}<RollingNumber value={Math.abs(value)} />
    </span>
  )
}

/**
 * The page's hero: the expected balance in 12 months (its range, the tight months, today, the
 * change over the year and the lowest month), or, with a month picked on the chart, that month:
 * its expected balance and range, money in and out, and whether it is tight. The rows keep their
 * places in both (stable layout); the numbers roll from one to the other.
 */
export function ProjectionHero({ months, start, end, tight, cushion }: {
  months: ProjectedMonth[]
  start: number
  end: ProjectedMonth
  tight: ProjectedMonth[]
  cushion: number
}) {
  const { month } = useSelectedMonth()
  const picked = month ? months.find(m => m.month === month) : undefined
  const shown = picked ?? end
  const line = picked ? (picked.tight ? `צפוי להיות דחוק — עד ${formatCurrencyWhole(picked.low)}` : null) : tightLine(tight)
  const fresh = months.filter(m => !m.stale)
  const lowest = (fresh.length ? fresh : months).reduce((a, m) => (m.expected < a.expected ? m : a))
  return (
    <section className="surface-hero flex flex-col rounded-xl p-4 sm:p-6">
      <p className="text-sm text-muted-foreground">{picked ? `בסוף ${monthLabel(picked.month)}` : 'בעוד 12 חודשים'}</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums sm:text-[2.75rem]"><RollingNumber value={shown.expected} /></p>
      <p className="mt-2 text-sm text-muted-foreground tabular-nums">
        בין <RollingNumber value={shown.low} /> ל-<RollingNumber value={shown.high} />
      </p>
      {/* Reserved: the row is there whether or not a month is tight (stable layout) */}
      <p
        data-tight-line
        aria-hidden={!line || undefined}
        className={cn('mt-3 flex min-h-5 items-center gap-1.5 text-sm text-[hsl(var(--expense))]', !line && 'invisible')}
      >
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
        {line ?? '—'}
      </p>
      <div className="mt-auto pt-4">
        {picked ? (
          <>
            <Fact label="נכנס בחודש"><Signed value={picked.income} /></Fact>
            <Fact label="יוצא בחודש"><Signed value={-picked.expense} /></Fact>
            <Fact label="שינוי מהיום"><Signed value={picked.expected - start} /></Fact>
          </>
        ) : (
          <>
            <Fact label="היום"><RollingNumber value={start} /></Fact>
            <Fact label="שינוי בשנה"><Signed value={end.expected - start} /></Fact>
            <Fact label={<>החודש הנמוך <span className="text-xs">{monthLabel(lowest.month)}</span></>}>
              <RollingNumber value={lowest.expected} />
            </Fact>
          </>
        )}
        <Fact
          label={
            <Link
              href="/settings#projection"
              className="inline-flex items-center gap-1.5 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="שינוי הכרית בהגדרות"
            >
              כרית ביטחון
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        >
          <RollingNumber value={cushion} />
        </Fact>
      </div>
    </section>
  )
}
