import { prisma } from './client'
import { CARD_PAYMENT_KEYWORDS } from '@/lib/insights/card-payment'
import { pickCardPaymentRow } from '@/lib/accounts/card-payment-row'
import { seriesColor } from '@/lib/accounts/colors'
import { BANK_COLORS } from '@/lib/nav/state'

// Local calendar date, like the rest of the app (dates are stored as local midnight)
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface CardPaymentRow {
  /** The bank row */
  txId: string
  /** "YYYY-MM-DD" */
  date: string
  debit: number
  bank: {
    id: string
    displayName: string
    provider: string
    /** Its series colour, as in the bank wallet (app/banks/layout.tsx) */
    color: string
    /** Account.color (ENG-66), for the face */
    colorChoice: string | null
  }
}

/**
 * The bank row that paid a card's billing month (the bank debits in that
 * calendar month): from the card's payer account when it has one, else from
 * any bank whose rows name the card's company (lib/accounts/card-payment-row.ts
 * picks). Loads only the month's debits that may be card payments (the keyword
 * prefilter, as in lib/db/card-payers.ts). Ignored rows don't count here: the
 * link points at a payment the bank page shows. Null when none matches.
 */
export async function getCardPaymentRow(
  card: { id: string; payerAccountId: string | null },
  year: number,
  month: number,
  chargesTotal: number
): Promise<CardPaymentRow | null> {
  const keywordFilter = CARD_PAYMENT_KEYWORDS.flatMap(k => [
    { description: { contains: k } },
    { originalDescription: { contains: k } },
  ])
  const [rows, cards, banks] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        ...(card.payerAccountId ? { accountId: card.payerAccountId } : {}),
        account: { kind: 'BANK' },
        date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) },
        debit: { gt: 0 },
        ignored: false,
        OR: keywordFilter,
      },
      select: { id: true, accountId: true, date: true, description: true, originalDescription: true, debit: true },
    }),
    // Every card (archived too): the linked / unlinked rules need the company's other cards
    prisma.account.findMany({
      where: { kind: 'CREDIT_CARD' },
      select: { id: true, provider: true, archived: true, payerAccountId: true },
    }),
    prisma.account.findMany({ where: { kind: 'BANK' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
  ])

  const picked = pickCardPaymentRow(
    rows.map(r => ({
      id: r.id,
      accountId: r.accountId,
      date: ymd(r.date),
      descriptions: [r.originalDescription, r.description],
      debit: r.debit,
    })),
    card.id,
    cards,
    chargesTotal
  )
  if (!picked) return null

  // The bank's face colour as its wallet gives it: positional among active accounts
  let active = 0
  const bank = banks
    .map(a => ({ a, color: seriesColor(a.color, a.archived ? BANK_COLORS[0] : BANK_COLORS[active++ % BANK_COLORS.length]) }))
    .find(b => b.a.id === picked.accountId)
  if (!bank) return null
  return {
    txId: picked.id,
    date: picked.date,
    debit: picked.debit,
    bank: {
      id: bank.a.id,
      displayName: bank.a.displayName,
      provider: bank.a.provider,
      color: bank.color,
      colorChoice: bank.a.color,
    },
  }
}
