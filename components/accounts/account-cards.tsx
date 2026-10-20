import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { AccountMini, BankElement } from '@/components/accounts/account-element'
import { WalletLink } from '@/components/cards/card-wallet'
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

/**
 * /cards: one card's period figures, as a row of the list next to the stack
 * (ENG-56). The row opens the card, moving it out of the stack like a tap on it.
 */
export function CardSummaryRow({
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
    <li>
      <WalletLink
        href={href}
        aria-label={`${cardLabel({ provider, name, lastFour, network })}: לפירוט הכרטיס`}
        className={cn(
          'group flex items-start gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-muted/50 sm:px-5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
        )}
      >
        <AccountMini kind="CREDIT_CARD" provider={provider} network={network} color={color} className="mt-0.5 w-12" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate font-medium">
              {name}
              {lastFour && (
                <span dir="ltr" className="ms-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                  •••• {lastFour}
                </span>
              )}
            </p>
            <p className="flex shrink-0 items-center gap-1.5 font-semibold tabular-nums">
              {/* The card's colour in the chart above */}
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
              <RollingNumber value={total} format="currencyExact" />
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span>
              <RollingNumber value={count} format="integer" /> עסקאות
            </span>
            {share !== undefined && (
              <span>
                <RollingNumber value={Math.round(share * 100)} format="percent" /> מהחיובים בכל הכרטיסים
              </span>
            )}
          </div>
          {share !== undefined && (
            <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, backgroundColor: color }} />
            </div>
          )}
          {topCategories.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5 text-xs text-muted-foreground" aria-label="קטגוריות מובילות">
              {topCategories.map(c => (
                <li key={c.name} className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? 'var(--chart-cc)' }} aria-hidden />
                  <span className="text-foreground/80">{c.name}</span>
                  <span className="tabular-nums">
                    <RollingNumber value={c.total} format="currency" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
      </WalletLink>
    </li>
  )
}
