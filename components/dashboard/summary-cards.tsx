import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { cn } from '@/lib/utils/cn'

type Tone = 'income' | 'expense' | 'cc' | 'neutral'

interface StatDef {
  label: string
  value: number
  tone: Tone
  href: string
  hint?: string
}

interface Props {
  bankIncome: number
  bankExpense: number
  ccTotal: number
  averageExpense?: number
  /** Current year/month query string, carried over to drill-down links */
  query: string
}

const DOT: Record<Tone, string> = {
  income: 'bg-[hsl(var(--income))]',
  expense: 'bg-[hsl(var(--expense))]',
  cc: 'bg-[hsl(var(--cc))]',
  neutral: 'bg-muted-foreground',
}

function StatTile({ label, value, tone, href, hint, wide }: StatDef & { wide?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col justify-between gap-3 rounded-xl border bg-card p-4',
        'transition-[background-color,border-color,transform] duration-200',
        'hover:border-primary/30 hover:bg-primary/[0.03] active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        wide && 'col-span-2'
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn('h-2 w-2 rounded-full shrink-0', DOT[tone])} aria-hidden />
        <span className="font-medium">{label}</span>
        <ChevronLeft
          className="ms-auto h-4 w-4 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:-translate-x-0.5"
          aria-hidden
        />
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          <RollingNumber value={value} />
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Link>
  )
}

function percent(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0
}

// Bank expenses already include the monthly card payment, so the net is bank-only
function NetBalance({ bankIncome, bankExpense }: Pick<Props, 'bankIncome' | 'bankExpense'>) {
  const outflow = bankExpense
  const net = bankIncome - outflow
  const scale = Math.max(bankIncome, outflow)
  const spentPct = percent(outflow, bankIncome)
  const positive = net >= 0

  return (
    <section
      aria-label="מאזן נטו"
      className="flex flex-col justify-between gap-6 rounded-xl border bg-card p-5 sm:p-6"
    >
      <div>
        <p className="text-sm font-medium text-muted-foreground">מאזן נטו</p>
        <p
          className={cn(
            'mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-[2.75rem] sm:leading-none',
            positive ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'
          )}
        >
          <RollingNumber value={net} duration={800} />
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

export function DashboardSummaryCards({ bankIncome, bankExpense, ccTotal, averageExpense, query }: Props) {
  const qs = query ? `?${query}` : ''

  const stats: StatDef[] = [
    { label: 'הכנסות', value: bankIncome, tone: 'income', href: `/bank${qs}`, hint: 'בנק לאומי' },
    { label: 'הוצאות', value: bankExpense, tone: 'expense', href: `/bank${qs}`, hint: 'בנק לאומי' },
    { label: 'חיובי כרטיס', value: ccTotal, tone: 'cc', href: `/cards/max${qs}`, hint: 'מקס · כלול בהוצאות' },
    ...(averageExpense !== undefined
      ? [{ label: 'ממוצע חודשי', value: averageExpense, tone: 'neutral' as const, href: `/bank${qs}`, hint: 'הוצאות בנק' }]
      : []),
  ]

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <NetBalance bankIncome={bankIncome} bankExpense={bankExpense} />
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <StatTile key={s.label} {...s} wide={stats.length % 2 === 1 && i === stats.length - 1} />
        ))}
      </div>
    </div>
  )
}
