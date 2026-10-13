import Link from 'next/link'
import { Building2, ChevronLeft, CreditCard } from 'lucide-react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { formatDate } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

const LINK =
  'group flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5 transition-[background-color,border-color,transform] duration-200 ' +
  'hover:border-primary/30 hover:bg-primary/[0.03] active:scale-[0.99] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function CardHeader({ icon: Icon, name, sub }: { icon: typeof Building2; name: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

function Footer({ label }: { label: string }) {
  return (
    <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
      {label}
      <ChevronLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
    </span>
  )
}

/** Share of the combined total, as a thin meter; hidden when there is only one account. */
function ShareMeter({ share, color, label }: { share: number; color: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs text-muted-foreground">
        <RollingNumber value={Math.round(share * 100)} format="percent" /> {label}
      </p>
    </div>
  )
}

function Row({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium tabular-nums', className)}>
        <RollingNumber value={value} format="currencyExact" />
      </dd>
    </div>
  )
}

export interface BankAccountSummary {
  href: string
  name: string
  income: number
  expense: number
  /** Balance after the latest transaction in the period */
  latest?: { balance: number; date: string }
  /** Share of the combined bank expense (only with several accounts) */
  expenseShare?: number
}

export function BankAccountCard({ href, name, income, expense, latest, expenseShare }: BankAccountSummary) {
  const net = income - expense
  return (
    <Link href={href} className={LINK}>
      <CardHeader
        icon={Building2}
        name={name}
        sub={latest ? `יתרה ${formatDate(latest.date)}` : 'אין תנועות בתקופה'}
      />
      {latest && (
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          <RollingNumber value={latest.balance} format="currencyExact" />
        </p>
      )}
      <dl className="space-y-1.5">
        <Row label="הכנסות" value={income} className="text-[hsl(var(--income))]" />
        <Row label="הוצאות" value={expense} className="text-[hsl(var(--expense))]" />
        <Row
          label="מאזן נטו"
          value={net}
          className={net >= 0 ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'}
        />
      </dl>
      {expenseShare !== undefined && (
        <ShareMeter share={expenseShare} color="hsl(var(--expense))" label="מההוצאות בכל החשבונות" />
      )}
      <Footer label="לפירוט החשבון" />
    </Link>
  )
}

export interface CardAccountSummary {
  href: string
  name: string
  lastFour?: string | null
  total: number
  count: number
  /** CSS color of this card's series in the chart */
  color: string
  /** Share of the combined card charges (only with several cards) */
  share?: number
  topCategories: { name: string; total: number; color?: string }[]
}

export function CardAccountCard({ href, name, lastFour, total, count, color, share, topCategories }: CardAccountSummary) {
  return (
    <Link href={href} className={LINK}>
      <CardHeader
        icon={CreditCard}
        name={name}
        sub={lastFour ? `כרטיס ·${lastFour}` : undefined}
      />
      <div>
        <p className="flex items-center gap-2 text-2xl font-semibold tracking-tight tabular-nums">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <RollingNumber value={total} format="currencyExact" />
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <RollingNumber value={count} format="integer" /> עסקאות
        </p>
      </div>
      {share !== undefined && <ShareMeter share={share} color={color} label="מהחיובים בכל הכרטיסים" />}
      {topCategories.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">קטגוריות מובילות</p>
          <dl className="space-y-1.5">
            {topCategories.map(c => (
              <div key={c.name} className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? 'var(--chart-cc)' }} aria-hidden />
                <dt className="min-w-0 flex-1 truncate">{c.name}</dt>
                <dd className="tabular-nums text-muted-foreground">
                  <RollingNumber value={c.total} format="currencyExact" />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <Footer label="לפירוט הכרטיס" />
    </Link>
  )
}
