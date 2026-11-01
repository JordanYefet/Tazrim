import { CARD_COLORS } from '@/lib/nav/state'
import { seriesColor } from '@/lib/accounts/colors'
import { accountHref } from '@/lib/accounts/routes'
import { periodQuery, type Period } from '@/lib/period'
import type { PayerCard } from '@/lib/accounts/card-payer'

/** A card as a bank row's card-payment badge needs it: the payer match (cardsForPayment) and its face */
export interface BadgeCard extends PayerCard {
  name: string
  lastFour: string | null
  network: string | null
  /** Its series colour, as in the nav and on /cards */
  color: string
  /** Account.color (ENG-66), for the face */
  colorChoice: string | null
}

interface CardAccountLike {
  id: string
  kind: string
  provider: string
  archived: boolean
  payerAccountId: string | null
  displayName: string
  cardLastFour: string | null
  cardNetwork: string | null
  color: string | null
}

/**
 * The cards of an account list (oldest first, archived included) for the badges.
 * Active cards take the nav's positional colours (lib/nav/state.ts, same order),
 * so a badge's face matches the card's dot; archived ones follow them.
 */
export function badgeCards(accounts: readonly CardAccountLike[]): BadgeCard[] {
  const cards = accounts.filter(a => a.kind === 'CREDIT_CARD')
  const ordered = [...cards.filter(a => !a.archived), ...cards.filter(a => a.archived)]
  return ordered.map((a, i) => ({
    id: a.id,
    provider: a.provider,
    archived: a.archived,
    payerAccountId: a.payerAccountId,
    name: a.displayName,
    lastFour: a.cardLastFour,
    network: a.cardNetwork,
    color: seriesColor(a.color, CARD_COLORS[i % CARD_COLORS.length]),
    colorChoice: a.color,
  }))
}

/**
 * The month a row's date falls in: a "YYYY-MM-DD" key as written (no time zone
 * shift), else the date in local time, as formatDate shows it.
 */
export function monthOfDate(date: string | Date): Required<Period> {
  if (typeof date === 'string') {
    const key = /^(\d{4})-(\d{2})-\d{2}$/.exec(date)
    if (key) return { year: Number(key[1]), month: Number(key[2]) }
  }
  const d = typeof date === 'string' ? new Date(date) : date
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * The card's page for the month of the bank row that paid it: the bank debits
 * on the card's billing day, and a card page's months are billing months.
 */
export function cardPaymentHref(cardId: string, date: string | Date): string {
  return accountHref('CREDIT_CARD', cardId, periodQuery(monthOfDate(date)))
}
