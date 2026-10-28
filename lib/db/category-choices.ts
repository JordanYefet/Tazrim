import { prisma } from './client'
import { listGenericDescriptions } from './generic-descriptions'
import { isCardPaymentRow, type BankDirection } from '../insights/bank-categories'

// What a category can be filled from, for the categories page's pickers

export interface CardMerchant {
  provider: string
  /** As the file has it: the merchant rule's key */
  originalName: string
  /** The name shown (the merchant rule's display name when there is one) */
  displayName: string
  count: number
}

/** Every card merchant once per provider, with its display name and number of charges */
export async function listCardMerchants(): Promise<CardMerchant[]> {
  const [rows, aliases] = await Promise.all([
    prisma.$queryRaw<{ provider: string; originalName: string; merchantName: string; n: bigint | number }[]>`
      SELECT a."provider" AS provider, t."originalMerchantName" AS originalName,
             MAX(t."merchantName") AS merchantName, COUNT(*) AS n
      FROM "CreditCardTransaction" t JOIN "Account" a ON a."id" = t."accountId"
      GROUP BY a."provider", t."originalMerchantName"
      ORDER BY t."originalMerchantName"`,
    prisma.transactionAlias.findMany({ select: { provider: true, originalName: true, displayName: true } }),
  ])
  const shown = new Map(aliases.map(a => [`${a.provider}\u0000${a.originalName}`, a.displayName]))
  return rows.map(r => ({
    provider: r.provider,
    originalName: r.originalName,
    displayName: shown.get(`${r.provider}\u0000${r.originalName}`) || r.merchantName,
    count: Number(r.n),
  }))
}

export interface BankDescription {
  provider: string
  originalDescription: string
  count: number
}

/**
 * Every bank description of one direction once per provider, with its number of rows.
 * The card payment (the cards hold its breakdown) and generic descriptions (no rule
 * can categorise them) are left out.
 */
export async function listBankDescriptions(direction: BankDirection): Promise<BankDescription[]> {
  const [rows, generic] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: direction === 'OUT' ? { debit: { gt: 0 } } : { credit: { gt: 0 } },
      select: { originalDescription: true, description: true, debit: true, account: { select: { provider: true } } },
    }),
    listGenericDescriptions(),
  ])
  const skip = new Set(generic)
  const counts = new Map<string, BankDescription>()
  for (const r of rows) {
    if (skip.has(r.originalDescription) || isCardPaymentRow(r)) continue
    const key = `${r.account.provider}\u0000${r.originalDescription}`
    const entry = counts.get(key) ?? { provider: r.account.provider, originalDescription: r.originalDescription, count: 0 }
    entry.count++
    counts.set(key, entry)
  }
  return [...counts.values()].sort((a, b) => a.originalDescription.localeCompare(b.originalDescription))
}
