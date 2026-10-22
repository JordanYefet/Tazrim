import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { RollingNumber, type RollingFormat } from '@/components/ui/rolling-number'
import { cn } from '@/lib/utils/cn'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { monthAverageDelta } from '@/lib/insights/account-overview'

export type Tone = 'income' | 'expense' | 'cc' | 'neutral'

export interface StatDef {
  label: string
  value: number
  tone: Tone
  /** Drill-down link; without one the tile is static */
  href?: string
  hint?: string
  /** Per-account split under the value (only passed with 2+ accounts) */
  split?: { label: string; value: number }[]
  format?: RollingFormat
  /** A selected month compared with this (average) value, shown as a "+12%" chip */
  compare?: MonthCompare
  /**
   * The tile can carry a comparison chip beside its value. Its figure is sized to
   * leave room for the chip in both states, so the tile never changes size.
   */
  hasCompareSlot?: boolean
}

export interface MonthCompare {
  /** e.g. "יוני" */
  label: string
  value: number
  /** (value - average) / average, null when there is no average */
  delta: number | null
}

/** The yearly average tile; with a month selected a chip shows that month against the average. */
export function averageStat(
  def: Omit<StatDef, 'value' | 'compare' | 'hasCompareSlot'>,
  average: number,
  /** `hasData: false`: the month has no data yet, so no chip (not "-100%") */
  month?: { label: string; value: number; hasData?: boolean }
): StatDef {
  return {
    ...def,
    value: average,
    compare: month && { label: month.label, value: month.value, delta: monthAverageDelta(month.value, average, month.hasData ?? true) },
    hasCompareSlot: true,
  }
}

const pct = new Intl.NumberFormat('he-IL', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' })

/**
 * The selected month against the average, as a small chip beside the average
 * itself: up is more spending than usual, down is less. The month's own value
 * already has its tile, so only the percentage is shown, and the tile keeps
 * its size whether or not a month is selected.
 */
function DeltaChip({ label, delta }: MonthCompare) {
  if (delta === null) return null
  const up = Math.round(delta * 100) > 0
  const down = Math.round(delta * 100) < 0
  const relation = up ? 'מעל הממוצע' : down ? 'מתחת לממוצע' : 'כמו הממוצע'
  return (
    <span
      className={cn(
        'shrink-0 self-center rounded px-1.5 py-0.5 text-xs font-medium tabular-nums',
        up && 'bg-[hsl(var(--expense))]/10 text-[hsl(var(--expense))]',
        down && 'bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]',
        !up && !down && 'bg-muted text-muted-foreground'
      )}
      title={`${label} ${relation}`}
      aria-label={`${label}: ${pct.format(delta)} ${relation}`}
    >
      <span dir="ltr">{pct.format(delta)}</span>
    </span>
  )
}

interface Props {
  bankIncome: number
  bankExpense: number
  ccTotal: number
  /** Yearly average bank expense (bank only, never plus card charges) */
  averageExpense: number
  /** The selected month's name, to compare its expense with the average */
  monthLabel?: string
  /** Whether the selected month has any data; without, the average gets no comparison chip */
  monthHasData?: boolean
  /** Current year/month query string, carried over to drill-down links */
  query: string
  /** Bank account name, or a count when there are several */
  bankHint: string
  /** Card name, or a count when there are several */
  cardHint: string
  /** Card total per card, when there is more than one card */
  cardSplit?: { label: string; value: number }[]
}

export const DOT: Record<Tone, string> = {
  income: 'bg-[hsl(var(--income))]',
  expense: 'bg-[hsl(var(--expense))]',
  cc: 'bg-[hsl(var(--cc))]',
  neutral: 'bg-muted-foreground',
}

export function StatTile({ label, value, tone, href, hint, format, split, compare, hasCompareSlot, wide }: StatDef & { wide?: boolean }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn('h-2 w-2 rounded-full shrink-0', DOT[tone])} aria-hidden />
        <span className="font-medium">{label}</span>
        {href && (
          <ChevronLeft
            className="ms-auto h-4 w-4 opacity-0 transition-all duration-fast group-hover:opacity-100 group-hover:-translate-x-0.5"
            aria-hidden
          />
        )}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'min-w-0 font-semibold tracking-tight tabular-nums text-foreground',
              // agorot, or a comparison chip beside the figure, make the line longer:
              // keep it on one line in half-width phone tiles
              format === 'currencyExact' || hasCompareSlot ? 'whitespace-nowrap text-lg sm:text-2xl' : 'text-2xl'
            )}
          >
            <RollingNumber value={value} format={format} />
          </p>
          {compare && <DeltaChip {...compare} />}
        </div>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        {split && split.length > 1 && (
          <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs text-muted-foreground" aria-label="פירוט לפי כרטיס">
            {split.map(s => (
              <li key={s.label} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">{s.label}</span>
                <span className="shrink-0 font-medium tabular-nums text-foreground">{formatCurrencyWhole(s.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
  // Values sit right under the label (not pushed to the bottom), so they line up
  // across a row even when one tile has an extra hint or comparison line
  const base = cn(
    'group relative flex flex-col gap-3 rounded-xl surface-raised p-4',
    wide && 'col-span-2'
  )
  if (!href) return <div className={base}>{body}</div>
  return (
    <Link
      href={href}
      className={cn(
        base,
        'transition-[background-color,border-color,box-shadow,transform] duration-fast',
        'hover:border-primary/30 hover:shadow-e3 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      )}
    >
      {body}
    </Link>
  )
}

/** Two-column tile grid; an odd last tile spans both columns. */
export function StatGrid({ stats }: { stats: StatDef[] }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {stats.map((s, i) => (
        <StatTile key={s.label} {...s} wide={stats.length % 2 === 1 && i === stats.length - 1} />
      ))}
    </div>
  )
}

function percent(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0
}

// Bank expenses already include the monthly card payment, so the net is bank-only
export function NetBalance({
  bankIncome,
  bankExpense,
  format,
}: Pick<Props, 'bankIncome' | 'bankExpense'> & { format?: RollingFormat }) {
  const outflow = bankExpense
  const net = bankIncome - outflow
  const scale = Math.max(bankIncome, outflow)
  const spentPct = percent(outflow, bankIncome)
  const positive = net >= 0

  return (
    <section
      aria-label="מאזן נטו"
      className="flex flex-col justify-between gap-6 rounded-xl surface-hero p-4 sm:p-6"
    >
      <div>
        <p className="text-sm font-medium text-muted-foreground">מאזן נטו</p>
        <p
          className={cn(
            'mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-[2.75rem] sm:leading-none',
            positive ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'
          )}
        >
          <RollingNumber value={net} format={format} />
        </p>
        {bankIncome > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {positive ? (
              <>נשאר <RollingNumber value={Math.round(100 - spentPct)} format="percent" /> מההכנסות</>
            ) : (
              <>ההוצאות גבוהות ב־<RollingNumber value={Math.round(spentPct - 100)} format="percent" /> מההכנסות</>
            )}
          </p>
        )}
      </div>

      {scale > 0 && (
        <div className="space-y-2">
          {/* Outflow vs. income meter: the track is whichever side is larger */}
          <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-[hsl(var(--expense))]"
              style={{ width: `${percent(outflow, scale)}%` }}
            />
            {outflow > bankIncome && bankIncome > 0 && (
              <span
                className="absolute inset-y-0 w-0.5 bg-foreground/70"
                style={{ insetInlineStart: `${percent(bankIncome, scale)}%` }}
                aria-hidden
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', DOT.expense)} aria-hidden />
              הוצאות (כולל חיובי כרטיס)
            </span>
            {outflow > bankIncome && bankIncome > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-0.5 bg-foreground/70" aria-hidden />
                גובה ההכנסות
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export function DashboardSummaryCards({
  bankIncome,
  bankExpense,
  ccTotal,
  averageExpense,
  monthLabel,
  monthHasData = true,
  query,
  bankHint,
  cardHint,
  cardSplit,
}: Props) {
  const qs = query ? `?${query}` : ''

  const stats: StatDef[] = [
    { label: 'הכנסות', value: bankIncome, tone: 'income', href: `/banks${qs}`, hint: bankHint },
    { label: 'הוצאות', value: bankExpense, tone: 'expense', href: `/banks${qs}`, hint: bankHint },
    {
      label: 'חיובי כרטיס',
      value: ccTotal,
      tone: 'cc',
      href: `/cards${qs}`,
      hint: `${cardHint} · כלול בהוצאות`,
      split: cardSplit,
    },
    averageStat(
      { label: 'ממוצע חודשי', tone: 'neutral', href: `/banks${qs}`, hint: 'הוצאות בנק' },
      averageExpense,
      monthLabel ? { label: monthLabel, value: bankExpense, hasData: monthHasData } : undefined
    ),
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <NetBalance bankIncome={bankIncome} bankExpense={bankExpense} />
      <StatGrid stats={stats} />
    </div>
  )
}
