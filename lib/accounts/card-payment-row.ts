import { cardsForPayment, type PayerCard } from '@/lib/accounts/card-payer'

/** A bank debit that may be a card payment, as the picking needs it */
export interface PaymentRowCandidate {
  id: string
  /** The bank account it left: the payer match is per row (cardsForPayment) */
  accountId: string
  /** "YYYY-MM-DD", local */
  date: string
  /** Raw and shown descriptions; the company is read from the first that names one */
  descriptions: (string | null | undefined)[]
  debit: number
}

/**
 * The bank row that paid a card's month: among the month's debits, those that
 * pay this card (cardsForPayment, with each row's own account, so the linked /
 * unlinked rules hold), the one closest to the card's charges for the month;
 * on a tie the latest. Null when none pays it.
 */
export function pickCardPaymentRow<T extends PaymentRowCandidate>(
  rows: readonly T[],
  cardId: string,
  cards: readonly PayerCard[],
  chargesTotal: number
): T | null {
  let best: T | null = null
  let bestGap = Infinity
  for (const row of rows) {
    if (!cardsForPayment(row.descriptions, row.accountId, cards).some(c => c.id === cardId)) continue
    const gap = Math.abs(row.debit - chargesTotal)
    // Amounts are agorot-precise: closer than half an agora is a tie
    if (gap < bestGap - 0.005 || (Math.abs(gap - bestGap) <= 0.005 && best && row.date > best.date)) {
      best = row
      bestGap = gap
    }
  }
  return best
}

/** "DD.MM" from a "YYYY-MM-DD" key */
export function dayMonth(date: string): string {
  const [, m, d] = date.split('-')
  return `${d}.${m}`
}
