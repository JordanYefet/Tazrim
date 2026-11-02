import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { AccountMini } from '@/components/accounts/account-element'
import { accountHref } from '@/lib/accounts/routes'
import { periodQuery, type Period } from '@/lib/period'
import { dayMonth } from '@/lib/accounts/card-payment-row'
import type { CardPaymentRow } from '@/lib/db/card-payment-row'

/**
 * "Paid from <bank>" at the end of a card page's heading row, for one month:
 * the bank row that paid the month's charges, opened on the bank's page with
 * that row brought into view (the bank table reads `tx`). The other way from
 * the bank row's card badge (components/bank/card-payment-badge.tsx).
 *
 * No taller than the row's minimum (PageHeading), and narrow enough on phones
 * that the row never wraps: the title stays put whether it is there or not.
 */
export function CardPayerChip({
  payment,
  cardName,
  period,
}: {
  payment: CardPaymentRow
  cardName: string
  period: Required<Period>
}) {
  const { bank } = payment
  const date = dayMonth(payment.date)
  const amount = formatCurrency(payment.debit)
  const href = accountHref('BANK', bank.id, { ...periodQuery(period), tx: payment.txId })
  return (
    <Link
      href={href}
      aria-label={`החיוב של ${cardName} לחודש ${monthName(period.month)} שולם מ${bank.displayName} ב־${date}, ${amount}. מעבר לתנועה`}
      className={cn(
        'inline-flex h-8 min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full border bg-card ps-1 pe-1.5 text-sm text-foreground',
        'transition-[background-color,border-color,transform] duration-quick ease-ui active:scale-[0.97]',
        // Hover only where there is a real pointer: on touch it would stick after the tap
        '[@media(hover:hover)_and_(pointer:fine)]:hover:border-primary/40 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <AccountMini kind="BANK" provider={bank.provider} color={bank.color} colorChoice={bank.colorChoice} className="w-[38px]" />
      {/* Phones: the bank's name only, cut to what is left beside the title (about 17rem
          for the title, gaps, face, chevron and the page's gutters), so the row never wraps */}
      <span className="min-w-0 truncate max-sm:max-w-[min(8rem,calc(100vw-17rem))] sm:max-w-[12rem]">
        <span className="max-sm:hidden">שולם מ</span>
        {bank.displayName}
      </span>
      <span className="text-muted-foreground max-sm:hidden">
        {/* Separate spans, so in RTL the dots stay between the parts */}
        <span aria-hidden>· </span>
        <span dir="ltr" className="tabular-nums">{date}</span>
        <span aria-hidden> · </span>
        <span className="tabular-nums">{amount}</span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}
