import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { RollingNumber, type RollingFormat } from '@/components/ui/rolling-number'
import { cn } from '@/lib/utils/cn'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { monthAverageDelta } from '@/lib/insights/account-overview'
import type { MonthProgress } from '@/lib/insights/month-progress'

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
  /** Extra content under the figure (e.g. a mini chart); it takes the tile's remaining height */
  footer?: ReactNode
}

export interface MonthCompare {
  /** e.g. "יוני" */
  label: string
  value: number
  /** (value - average) / average, null when there is no average */
  delta: number | null
  /** Above the average is good news (income), so up is green and down red */
  upIsGood?: boolean
}

/** The yearly average tile; with a month selected a chip shows that month against the average. */
export function averageStat(
  def: Omit<StatDef, 'value' | 'compare' | 'hasCompareSlot'>,
  average: number,
  /** `hasData: false`: the month has no data yet, so no chip (not "-100%") */
  month?: { label: string; value: number; hasData?: boolean },
  opts: { upIsGood?: boolean } = {}
): StatDef {
  return {
    ...def,
    value: average,
    compare: month && {
      label: month.label,
      value: month.value,
      delta: monthAverageDelta(month.value, average, month.hasData ?? true),
      upIsGood: opts.upIsGood,
    },
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
function DeltaChip({ label, delta, upIsGood }: MonthCompare) {
  if (delta === null) return null
  const up = Math.round(delta * 100) > 0
  const down = Math.round(delta * 100) < 0
  const relation = up ? 'מעל הממוצע' : down ? 'מתחת לממוצע' : 'כמו הממוצע'
  // Spending above the average is bad news; income above it is good
  const bad = upIsGood ? down : up
  const good = upIsGood ? up : down
  return (
    <span
      className={cn(
        'shrink-0 self-center rounded px-1.5 py-0.5 text-xs font-medium tabular-nums',
        bad && 'bg-[hsl(var(--expense))]/10 text-[hsl(var(--expense))]',
        good && 'bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]',
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
  /** Where the selected month stands today; a month in progress gets no verdict and no comparison */
  progress?: MonthProgress
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

export function StatTile({
  label,
  value,
  tone,
  href,
  hint,
  format,
  split,
  compare,
  hasCompareSlot,
  footer,
  wide,
  bare,
  dense,
}: StatDef & {
  wide?: boolean
  /** A cell of a StatPanel: no card of its own */
  bare?: boolean
  /** A cell of a compact StatPanel: label and figure on one small line */
  dense?: boolean
}) {
  if (dense) {
    return (
      <div className="flex h-full min-w-0 items-center gap-2 px-3 py-2 text-xs sm:px-4">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[tone])} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground" title={hint ? `${label} · ${hint}` : label}>
          {label}
        </span>
        {/* The chip before the figure, so every figure ends at the cell's edge and the columns line up */}
        {compare && <DeltaChip {...compare} />}
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
          <RollingNumber value={value} format={format} />
        </span>
      </div>
    )
  }
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn('h-2 w-2 rounded-full shrink-0', DOT[tone])} aria-hidden />
        <span className={cn('font-medium', bare && 'whitespace-nowrap')}>{label}</span>
        {/* A panel cell keeps one line of label: its hint follows it where there is room */}
        {bare && hint && <span className="hidden truncate text-xs xl:inline">· {hint}</span>}
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
              bare
                ? 'whitespace-nowrap text-lg leading-tight sm:text-xl'
                : format === 'currencyExact' || hasCompareSlot ? 'whitespace-nowrap text-lg sm:text-2xl' : 'text-2xl'
            )}
          >
            <RollingNumber value={value} format={format} />
          </p>
          {compare && <DeltaChip {...compare} />}
        </div>
        {hint && !bare && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
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
      {footer && <div className="flex min-h-0 flex-1 flex-col">{footer}</div>}
    </>
  )
  // Values sit right under the label (not pushed to the bottom), so they line up
  // across a row even when one tile has an extra hint or comparison line
  const base = bare
    ? 'group relative flex h-full flex-col justify-center gap-0.5 px-4 py-1'
    : cn('group relative flex flex-col gap-3 rounded-xl surface-raised p-4', wide && 'col-span-2')
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
/**
 * Several figures in ONE card, two per row with hairlines between them: no
 * gaps between tiles, so it fits beside the wallet with the net balance
 * (the bank pages). Rows share the card's height evenly.
 */
export function StatPanel({
  stats,
  compact,
  className,
}: {
  stats: StatDef[]
  /** Each figure on one small line (beside the bank wallet, under the account list) */
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn('grid auto-rows-fr grid-cols-2 overflow-hidden rounded-xl surface-raised', className)}>
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            'flex min-w-0 flex-col',
            i % 2 === 0 && 'border-e',
            i < stats.length - 2 && 'border-b'
          )}
        >
          <StatTile {...s} bare dense={compact} />
        </div>
      ))}
    </div>
  )
}

/** `uniform`: every row as tall as the tallest, so all tiles are the same size */
export function StatGrid({ stats, uniform, className }: { stats: StatDef[]; uniform?: boolean; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-4', uniform && 'auto-rows-fr', className)}>
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
  compact = false,
}: Pick<Props, 'bankIncome' | 'bankExpense'> & {
  format?: RollingFormat
  /** Beside the wallet (the bank pages): tighter, so it and the figures fit the wallet's height */
  compact?: boolean
}) {
  const outflow = bankExpense
  const net = bankIncome - outflow
  const scale = Math.max(bankIncome, outflow)
  const spentPct = percent(outflow, bankIncome)
  const positive = net >= 0

  return (
    <section
      aria-label="מאזן נטו"
      className={cn(
        'flex flex-col justify-between rounded-xl surface-hero p-4',
        compact ? 'gap-3 py-3 sm:px-5' : 'gap-6 sm:p-6'
      )}
    >
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          מאזן נטו
          {/* Compact: the share left joins the label line (no line of its own) */}
          {compact && bankIncome > 0 && (
            <span className="font-normal">
              {' · '}
              {positive ? (
                <>נשאר <RollingNumber value={Math.round(100 - spentPct)} format="percent" /> מההכנסות</>
              ) : (
                <>ההוצאות גבוהות ב־<RollingNumber value={Math.round(spentPct - 100)} format="percent" /></>
              )}
            </span>
          )}
        </p>
        <p
          className={cn(
            'mt-1 font-semibold tracking-tight tabular-nums',
            compact ? 'text-3xl leading-none' : 'text-4xl sm:text-[2.75rem] sm:leading-none',
            positive ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'
          )}
        >
          <RollingNumber value={net} format={format} />
        </p>
        {bankIncome > 0 && !compact && (
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
          <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground', compact && 'sr-only')}>
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

/**
 * The average chip of the expenses row. It is always laid out (the unseen text
 * reserves its width), and only fades in when there is something to compare.
 */
function AverageChip({ delta, visible, title }: { delta: number | null; visible: boolean; title?: string }) {
  const rounded = delta === null ? 0 : Math.round(delta * 100)
  const relation = rounded > 0 ? 'מעל הממוצע' : rounded < 0 ? 'מתחת לממוצע' : 'כמו הממוצע'
  const shown = visible && delta !== null
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium tabular-nums transition-opacity duration-fast',
        shown ? 'opacity-100' : 'opacity-0',
        // Spending above its average is bad news, below it good
        rounded > 0 && 'bg-[hsl(var(--expense))]/10 text-[hsl(var(--expense))]',
        rounded < 0 && 'bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]',
        rounded === 0 && 'bg-muted text-muted-foreground'
      )}
      title={shown ? title : undefined}
      aria-hidden={!shown}
    >
      {rounded === 0 ? (
        relation
      ) : (
        <>
          <RollingNumber value={Math.abs(rounded)} format="percent" /> {relation}
        </>
      )}
    </span>
  )
}

function HeroRow({
  label,
  hint,
  href,
  chip,
  value,
  tone,
  extra,
}: {
  label: string
  hint?: string
  href: string
  chip?: ReactNode
  value: number
  tone: Tone
  extra?: ReactNode
}) {
  return (
    <div className="border-t">
      <Link
        href={href}
        className="group flex min-h-[44px] items-center gap-2 rounded-md py-2 transition-colors duration-fast hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[tone])} aria-hidden />
        <dt className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{label}</span>
          {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
        </dt>
        {chip}
        <dd className="shrink-0 whitespace-nowrap text-base font-semibold tabular-nums text-foreground">
          <RollingNumber value={value} />
        </dd>
      </Link>
      {extra}
    </div>
  )
}

/**
 * The overview's one hero: the net figure and, under it, the rows that make it
 * (income, expenses with the monthly average, the card charges inside them).
 * The same rows sit in the same places for a finished month, a month in
 * progress, an empty month and the whole year. A month in progress gets no
 * verdict colour and no comparison, only what it holds so far.
 */
export function DashboardSummaryCards({
  bankIncome,
  bankExpense,
  ccTotal,
  averageExpense,
  monthLabel,
  monthHasData = true,
  progress,
  query,
  bankHint,
  cardHint,
  cardSplit,
}: Props) {
  const qs = query ? `?${query}` : ''
  // Bank expenses already include the card payment, so the net is bank-only
  const net = bankIncome - bankExpense
  const inProgress = !!progress?.inProgress
  const verdict = !inProgress && monthHasData
  const positive = net >= 0
  const spentPct = bankIncome > 0 ? (bankExpense / bankIncome) * 100 : 0
  const delta = monthLabel && verdict ? monthAverageDelta(bankExpense, averageExpense, monthHasData) : null

  const label = inProgress ? 'החודש עד כה' : 'מאזן נטו'
  let sub: ReactNode
  if (inProgress && progress) {
    sub = `${progress.day} ימים מתוך ${progress.daysInMonth} · עוד אין השוואות`
  } else if (!monthHasData) {
    sub = 'אין נתונים לתקופה הזו'
  } else if (bankIncome > 0) {
    sub = positive ? (
      <>נשאר <RollingNumber value={Math.round(100 - spentPct)} format="percent" /> מההכנסות</>
    ) : (
      <>ההוצאות גבוהות ב־<RollingNumber value={Math.round(spentPct - 100)} format="percent" /> מההכנסות</>
    )
  } else {
    sub = 'אין הכנסות בתקופה הזו'
  }

  // The year has no month to compare: its chip stays hidden and the row's hint tells the average
  const chip = (
    <AverageChip delta={delta} visible={verdict} title={monthLabel ? `${monthLabel} לעומת הממוצע החודשי` : undefined} />
  )

  return (
    <section aria-label={label} className="grid gap-x-10 gap-y-5 rounded-xl surface-hero p-4 sm:p-6 lg:grid-cols-2">
      <div className="flex flex-col justify-center">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-[2.75rem] sm:leading-none',
            !verdict
              ? 'text-foreground'
              : positive
                ? 'text-[hsl(var(--income))]'
                : 'text-[hsl(var(--expense))]'
          )}
        >
          <RollingNumber value={net} />
        </p>
        <p className="mt-2 min-h-5 text-sm text-muted-foreground">{sub}</p>
      </div>
      <dl className="flex flex-col justify-end">
        <HeroRow label="הכנסות" hint={bankHint} href={`/banks${qs}`} value={bankIncome} tone="income" />
        <HeroRow
          label="הוצאות"
          hint={`ממוצע חודשי ${formatCurrencyWhole(averageExpense)}`}
          href={`/banks${qs}`}
          value={bankExpense}
          tone="expense"
          chip={chip}
        />
        <HeroRow
          label="מתוכן בכרטיסים"
          hint={`${cardHint} · כלול בהוצאות`}
          href={`/cards${qs}`}
          value={ccTotal}
          tone="cc"
          extra={
            cardSplit && cardSplit.length > 1 ? (
              <ul className="mb-2 ms-4 space-y-0.5 text-xs text-muted-foreground" aria-label="פירוט לפי כרטיס">
                {cardSplit.map(s => (
                  <li key={s.label} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">{s.label}</span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">{formatCurrencyWhole(s.value)}</span>
                  </li>
                ))}
              </ul>
            ) : null
          }
        />
      </dl>
    </section>
  )
}
