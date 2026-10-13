import { prisma } from './client'
import { CARD_PAYMENT_KEYWORDS } from '@/lib/insights/card-payment'
import {
  detectMissingStatements,
  formatMonthRanges,
  type MissingStatement,
} from '@/lib/insights/missing-statements'

export type { MissingStatement }
export { formatMonthRanges }

// Local calendar date, like the rest of the app (dates are stored as local midnight)
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Missing statement months for every non-archived bank and card account
 * (see lib/insights/missing-statements.ts for the rules). Loads only buckets:
 * bank rows per day, card rows per billing date, and the few bank rows whose
 * description may be a card payment. Ignored rows count too: an ignored row
 * still means the statement was uploaded.
 */
export async function getMissingStatements(now: Date = new Date()): Promise<MissingStatement[]> {
  const keywordFilter = CARD_PAYMENT_KEYWORDS.flatMap(k => [
    { description: { contains: k } },
    { originalDescription: { contains: k } },
  ])
  const [accounts, bankDays, cardDays, payments] = await Promise.all([
    prisma.account.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, kind: true, provider: true, displayName: true, archived: true },
    }),
    prisma.bankTransaction.groupBy({ by: ['accountId', 'date'], _count: { _all: true } }),
    prisma.creditCardTransaction.groupBy({ by: ['accountId', 'billingDate'], _count: { _all: true } }),
    prisma.bankTransaction.findMany({
      where: { OR: keywordFilter },
      select: { accountId: true, date: true, description: true, originalDescription: true },
    }),
  ])

  // Card billing dates fold into months here (several billing dates a month)
  const cardMonths = new Map<string, { accountId: string; month: string; count: number }>()
  for (const c of cardDays) {
    const month = ymd(c.billingDate).slice(0, 7)
    const key = `${c.accountId}|${month}`
    const entry = cardMonths.get(key) ?? { accountId: c.accountId, month, count: 0 }
    entry.count += c._count._all
    cardMonths.set(key, entry)
  }

  return detectMissingStatements({
    accounts,
    bankDays: bankDays.map(b => ({ accountId: b.accountId, date: ymd(b.date), count: b._count._all })),
    cardMonths: [...cardMonths.values()],
    payments: payments.map(p => ({
      accountId: p.accountId,
      date: ymd(p.date),
      description: `${p.description}\n${p.originalDescription}`,
    })),
    today: ymd(now),
  })
}

/** Only the accounts that are missing something */
export async function getAccountsMissingStatements(now?: Date): Promise<MissingStatement[]> {
  return (await getMissingStatements(now)).filter(m => m.months.length > 0)
}
