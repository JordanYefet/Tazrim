import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { BankElement, PaymentCard } from '@/components/accounts/account-element'
import { cardLabel } from '@/lib/accounts/brands'
import { cn } from '@/lib/utils/cn'

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

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

export interface BankAccountSummary {
  href: string
  name: string
  provider: string
  /** The account's colour, for banks without a face of their own */
  color?: string
  income: number
  expense: number
  /** Balance after the latest transaction in the period */
  latest?: { balance: number; date: string }
  /** Month-end balances of the year, oldest first */
  trend?: number[]
  /** Share of the combined bank expense (only with several accounts) */
  expenseShare?: number
}

/** /banks tile: the bank account element itself is the link. */
export function BankAccountCard({ href, name, provider, color, income, expense, latest, trend, expenseShare }: BankAccountSummary) {
  return (
    <Link href={href} className={cn('group acct-press block h-full rounded-[18px]', FOCUS)}>
      <BankElement
        plain
        tilt
        provider={provider}
        name={name}
        color={color}
        latest={latest}
        totals={{ income, expense }}
        trend={trend}
        className="h-full transition-shadow group-hover:shadow-e3"
      >
        {expenseShare !== undefined && (
          <ShareMeter share={expenseShare} color="hsl(var(--expense))" label="מההוצאות בכל החשבונות" />
        )}
        <Footer label="לפירוט החשבון" />
      </BankElement>
    </Link>
  )
}

export interface CardAccountSummary {
  href: string
  name: string
  provider: string
  network?: string | null
  lastFour?: string | null
  total: number
  count: number
  /** CSS color of this card's series in the chart */
  color: string
  /** Share of the combined card charges (only with several cards) */
  share?: number
  topCategories: { name: string; total: number; color?: string }[]
}

/** /cards tile: the card element, with the period's figures under it. */
export function CardAccountCard({
  href,
  name,
  provider,
  network,
  lastFour,
  total,
  count,
  color,
  share,
  topCategories,
}: CardAccountSummary) {
  return (
    <Link
      href={href}
      className={cn(
        'group acct-press flex flex-col gap-4 rounded-xl surface-raised p-3 pb-4 transition-shadow duration-200 hover:shadow-e3 sm:p-4 sm:pb-5',
        FOCUS
      )}
    >
      <span className="sr-only">{cardLabel({ provider, name, lastFour, network })}</span>
      <PaymentCard decorative tilt provider={provider} name={name} lastFour={lastFour} network={network} color={color} />
      <div className="flex flex-col gap-4 px-1 sm:px-1.5">
        <div>
          <p className="flex items-center gap-2 text-2xl font-semibold tracking-tight tabular-nums">
            {/* The card's colour in the chart above */}
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
      </div>
    </Link>
  )
}
