import { ChevronLeft } from 'lucide-react'
import { RollingNumber } from '@/components/ui/rolling-number'
import { AccountMini } from '@/components/accounts/account-element'
import { WalletLink } from '@/components/cards/card-wallet'
import { cardLabel } from '@/lib/accounts/brands'
import { cn } from '@/lib/utils/cn'

/** One account's row in the list beside the wallet: its face, name, figure, a detail line and its share. */
function SummaryRow({
  href,
  ariaLabel,
  face,
  name,
  figure,
  color,
  detail,
  share,
  shareLabel,
}: {
  href: string
  ariaLabel: string
  /** The account's mini face, with anything under it */
  face: React.ReactNode
  name: string
  /** The row's main figure, after the account's colour dot */
  figure: React.ReactNode
  color: string
  /** Under the name */
  detail: React.ReactNode
  /** Share of the combined figure, with a thin meter (only with several accounts) */
  share?: number
  shareLabel: string
}) {
  return (
    // On wide screens the list matches the stack's height: rows share it evenly
    <li className="lg:flex lg:flex-1">
      <WalletLink
        href={href}
        aria-label={ariaLabel}
        className={cn(
          'group flex flex-1 items-center gap-3 px-4 py-3.5 transition-colors duration-quick hover:bg-muted/50 sm:px-5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
        )}
      >
        <span className="flex w-12 shrink-0 flex-col items-center gap-1">{face}</span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate font-medium">{name}</p>
            <p className="flex shrink-0 items-center gap-1.5 font-semibold tabular-nums">
              {/* The account's colour, as its element in the wallet */}
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
              {figure}
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span>{detail}</span>
            {share !== undefined && (
              <span>
                <RollingNumber value={Math.round(share * 100)} format="percent" /> {shareLabel}
              </span>
            )}
          </div>
          {share !== undefined && (
            <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, backgroundColor: color }} />
            </div>
          )}
        </div>
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast group-hover:-translate-x-0.5" aria-hidden />
      </WalletLink>
    </li>
  )
}

export interface BankAccountSummary {
  href: string
  name: string
  provider: string
  /** CSS color of this account's element in the wallet */
  color: string
  /** Account.color (ENG-66) */
  colorChoice?: string | null
  expense: number
  /** Balance after the latest transaction in the period */
  balance?: number
  /** Share of the combined bank expense (only with several accounts) */
  expenseShare?: number
}

/**
 * /banks: one account's period figures, as a row of the list next to the
 * wallet, like a card's on /cards (ENG-84). The row opens the account.
 */
export function BankSummaryRow({ href, name, provider, color, colorChoice, expense, balance, expenseShare }: BankAccountSummary) {
  return (
    <SummaryRow
      href={href}
      ariaLabel={`${name}: לפירוט החשבון`}
      face={<AccountMini kind="BANK" provider={provider} color={color} colorChoice={colorChoice} className="w-12" />}
      name={name}
      color={color}
      figure={balance !== undefined ? <RollingNumber value={balance} format="currencyExact" /> : <span className="text-muted-foreground">—</span>}
      detail={
        <>
          הוצאות <RollingNumber value={expense} format="currencyExact" />
        </>
      }
      share={expenseShare}
      shareLabel="מההוצאות בכל החשבונות"
    />
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
  /** Account.color (ENG-66) */
  colorChoice?: string | null
  /** Share of the combined card charges (only with several cards) */
  share?: number
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
  colorChoice,
  share,
}: CardAccountSummary) {
  return (
    <SummaryRow
      href={href}
      ariaLabel={`${cardLabel({ provider, name, lastFour, network })}: לפירוט הכרטיס`}
      face={
        // The card's face, its last four right under it (a fixed slot, so rows stay aligned without them)
        <>
          <AccountMini kind="CREDIT_CARD" provider={provider} network={network} color={color} colorChoice={colorChoice} className="w-12" />
          <span dir="ltr" className="h-4 text-[11px] leading-4 tabular-nums text-muted-foreground">
            {lastFour}
          </span>
        </>
      }
      name={name}
      color={color}
      figure={<RollingNumber value={total} format="currencyExact" />}
      detail={
        <>
          <RollingNumber value={count} format="integer" /> עסקאות
        </>
      }
      share={share}
      shareLabel="מהחיובים בכל הכרטיסים"
    />
  )
}
