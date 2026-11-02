import { prisma } from './client'
import { CARD_PAYMENT_KEYWORDS } from '@/lib/insights/card-payment'
import { collectPayerEvidence, type PayerEvidence } from '@/lib/accounts/payer-suggestion'

export type { PayerEvidence }

// Local calendar date, like the rest of the app (dates are stored as local midnight)
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Per card company, the bank accounts whose rows pay it: payments in the last
 * 12 months, the latest one (lib/accounts/payer-suggestion.ts). Loads only the
 * debits whose description may be a card payment (the keyword prefilter, as
 * in lib/db/missing-statements.ts). Archived bank accounts are included; the
 * callers filter to the ones a card can be linked to. Ignored rows count: an
 * ignored payment still left that account.
 */
export async function getCardPayerEvidence(now: Date = new Date()): Promise<PayerEvidence[]> {
  const keywordFilter = CARD_PAYMENT_KEYWORDS.flatMap(k => [
    { description: { contains: k } },
    { originalDescription: { contains: k } },
  ])
  const rows = await prisma.bankTransaction.findMany({
    where: { debit: { gt: 0 }, account: { kind: 'BANK' }, OR: keywordFilter },
    select: { accountId: true, date: true, description: true, originalDescription: true, debit: true },
  })
  return collectPayerEvidence(
    rows.map(r => ({
      accountId: r.accountId,
      date: ymd(r.date),
      description: `${r.description}\n${r.originalDescription}`,
      debit: r.debit,
    })),
    ymd(now)
  )
}

/** Today as "YYYY-MM-DD", local: the evidence's "today", for the wording */
export const localToday = (now: Date = new Date()) => ymd(now)
