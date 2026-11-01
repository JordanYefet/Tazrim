import { cardPaymentProvider } from '@/lib/insights/card-payment'

/** What the matching needs of a credit-card account */
export interface PayerCard {
  id: string
  provider: string
  archived: boolean
  /** Account.payerAccountId: the bank account its charge leaves, if set */
  payerAccountId: string | null
}

/**
 * The cards a bank row's card payment went to: the card company comes from
 * the row's description (cardPaymentProvider), then
 *
 * - the company's cards linked to this bank account, when there are any;
 * - else its cards with no payer set (the link is unknown, so they may be it);
 * - never a card linked to another bank account.
 *
 * Archived cards still match: an old payment row keeps pointing at the card
 * it paid. Several cards can come back (two cards of one company paid in one
 * debit); none for a generic description or a company with no card here.
 */
export function cardsForPayment(
  descriptions: (string | null | undefined)[],
  bankAccountId: string,
  cards: readonly PayerCard[]
): PayerCard[] {
  let provider: string | null = null
  for (const d of descriptions) if (d && (provider = cardPaymentProvider(d))) break
  if (!provider) return []
  const company = cards.filter(c => c.provider === provider)
  const linked = company.filter(c => c.payerAccountId === bankAccountId)
  if (linked.length) return linked
  return company.filter(c => c.payerAccountId === null)
}
