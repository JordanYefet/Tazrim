import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { monthName } from '@/lib/utils/date'
import { AccountMini } from '@/components/accounts/account-element'
import { cardsForPayment } from '@/lib/accounts/card-payer'
import { cardPaymentHref, monthOfDate, type BadgeCard } from '@/lib/accounts/payment-badge'

/**
 * A bank card-payment row's card(s): a mini face and "<name> ·1234", each a
 * link to that card's page for the row's month (the charges the debit paid).
 * Nothing when the row's company has no card here (cardsForPayment).
 */
export function CardPaymentBadges({
  descriptions,
  bankAccountId,
  date,
  cards,
  className,
}: {
  /** The row's raw and shown descriptions; the company is read from the first that names one */
  descriptions: (string | null | undefined)[]
  bankAccountId: string | undefined
  /** The row's date (ISO or a YYYY-MM-DD key): its month is the card month */
  date: string
  cards: readonly BadgeCard[]
  className?: string
}) {
  if (!bankAccountId || cards.length === 0) return null
  const matched = cardsForPayment(descriptions, bankAccountId, cards) as BadgeCard[]
  if (matched.length === 0) return null
  const { year, month } = monthOfDate(date)
  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center gap-1 align-middle', className)}>
      {matched.map(card => {
        const label = `${card.name}${card.lastFour ? ` · ${card.lastFour}` : ''}`
        return (
          <Link
            key={card.id}
            href={cardPaymentHref(card.id, date)}
            aria-label={`פירוט ${label} לחודש ${monthName(month)} ${year}`}
            title={`פירוט החיובים ב${monthName(month)} ${year}`}
            className={cn(
              'inline-flex h-[22px] max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border bg-background/60 ps-[3px] pe-2 text-[11px] text-muted-foreground',
              'transition-[background-color,color,border-color,transform] duration-fast ease-ui',
              'hover:border-primary/40 hover:bg-primary/5 hover:text-foreground active:scale-[0.97]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <AccountMini
              kind="CREDIT_CARD"
              provider={card.provider}
              color={card.color}
              colorChoice={card.colorChoice}
              network={card.network}
              className="w-[26px]"
            />
            {/* Phones keep the face and the last four (they tell two cards of a company apart);
                without last four digits the name stays */}
            <span className={cn('min-w-0 max-w-[7.5rem] truncate', card.lastFour && 'max-sm:hidden')}>{card.name}</span>
            {card.lastFour && (
              <>
                {/* Its own span, so in RTL it sits between the name and the digits */}
                <span aria-hidden className="-mx-0.5 max-sm:hidden">·</span>
                <span dir="ltr" data-steady className="tabular-nums opacity-80">{card.lastFour}</span>
              </>
            )}
          </Link>
        )
      })}
    </span>
  )
}
