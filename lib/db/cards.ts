import { Prisma } from '@prisma/client'
import { prisma } from './client'
import type { ParsedCCTransaction } from '../parsers/types'
import type { CardProvider } from '@prisma/client'

export async function upsertCCTransactions(
  transactions: ParsedCCTransaction[],
  fileName: string
): Promise<{ created: number; skipped: number }> {
  if (!transactions.length) return { created: 0, skipped: 0 }
  const provider = transactions[0]?.cardProvider ?? 'MAX'
  const source = provider === 'MAX' ? 'MAX' : 'HITECH'

  const aliases = await prisma.transactionAlias.findMany({ where: { source } })
  const aliasMap = new Map(aliases.map(a => [a.originalName, a.displayName]))

  let created = 0
  let skipped = 0

  for (const tx of transactions) {
    const contentHash = [
      tx.transactionDate.toISOString().slice(0, 10),
      tx.originalMerchantName,
      tx.chargedAmount.toFixed(2),
      tx.cardProvider,
    ].join('|')

    const crossFileDuplicate = await prisma.creditCardTransaction.findFirst({
      where: { contentHash, sourceFile: { not: fileName } },
    })
    if (crossFileDuplicate) { skipped++; continue }

    await prisma.creditCardTransaction.create({
      data: {
        transactionDate: tx.transactionDate,
        billingDate: tx.billingDate,
        originalMerchantName: tx.originalMerchantName,
        merchantName: aliasMap.get(tx.originalMerchantName) ?? tx.originalMerchantName,
        category: tx.category,
        chargedAmount: tx.chargedAmount,
        originalAmount: tx.originalAmount,
        originalCurrency: tx.originalCurrency,
        cardLastFour: tx.cardLastFour,
        transactionType: tx.transactionType,
        notes: tx.notes,
        cardProvider: tx.cardProvider as CardProvider,
        contentHash,
        sourceFile: fileName,
      },
    })
    created++
  }

  return { created, skipped }
}

export async function getCCTransactions(params: {
  provider: CardProvider
  month?: number
  year?: number
  search?: string
  merchant?: string
  category?: string
  showIgnored?: boolean
  take?: number
  skip?: number
}) {
  const where: Prisma.CreditCardTransactionWhereInput = {
    cardProvider: params.provider,
  }

  // undefined and false both mean "exclude ignored rows"
  if (!params.showIgnored) {
    where.ignored = false
  }

  if (params.year) {
    const m = params.month
    where.transactionDate = {
      gte: new Date(params.year, m ? m - 1 : 0, 1),
      lte: m
        ? new Date(params.year, m, 0, 23, 59, 59)
        : new Date(params.year, 12, 0, 23, 59, 59),
    }
  }

  if (params.merchant) {
    where.merchantName = params.merchant
  } else if (params.search) {
    where.merchantName = { contains: params.search }
  }

  // Top-level `ignored` is ANDed with every OR branch — no duplication needed.
  if (params.category) {
    where.OR = [
      { categoryOverride: params.category },
      { category: params.category, categoryOverride: null },
    ]
  }

  return prisma.creditCardTransaction.findMany({
    where,
    orderBy: { transactionDate: 'desc' },
    ...(params.take !== undefined ? { take: params.take } : {}),
    ...(params.skip !== undefined ? { skip: params.skip } : {}),
  })
}

export async function updateCCTransaction(
  id: string,
  data: { merchantName?: string; category?: string; categoryOverride?: string; ignored?: boolean }
) {
  return prisma.creditCardTransaction.update({ where: { id }, data })
}

export async function getCCCategorySummary(provider: CardProvider, year: number, month?: number) {
  const m = month
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      cardProvider: provider,
      ignored: false,
      transactionDate: {
        gte: new Date(year, m ? m - 1 : 0, 1),
        lte: m
          ? new Date(year, m, 0, 23, 59, 59)
          : new Date(year, 11, 31, 23, 59, 59),
      },
    },
  })

  const byCategory: Record<string, number> = {}
  for (const tx of txs) {
    const cat = tx.categoryOverride ?? tx.category
    byCategory[cat] = (byCategory[cat] ?? 0) + tx.chargedAmount
  }

  return byCategory
}

export async function bulkUpdateCCCategory(
  originalMerchantName: string,
  categoryOverride: string
) {
  return prisma.creditCardTransaction.updateMany({
    where: { originalMerchantName },
    data: { categoryOverride },
  })
}

export async function getCCCategoryStats(provider: CardProvider, year: number, month?: number) {
  const m = month
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      cardProvider: provider,
      ignored: false,
      transactionDate: {
        gte: new Date(year, m ? m - 1 : 0, 1),
        lte: m
          ? new Date(year, m, 0, 23, 59, 59)
          : new Date(year, 11, 31, 23, 59, 59),
      },
    },
  })
  const stats: Record<string, { total: number; count: number }> = {}
  for (const tx of txs) {
    const cat = tx.categoryOverride ?? tx.category
    if (!stats[cat]) stats[cat] = { total: 0, count: 0 }
    stats[cat].total += tx.chargedAmount
    stats[cat].count++
  }
  return stats
}

export async function getCCMonthlySummary(provider: CardProvider, year: number) {
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      cardProvider: provider,
      ignored: false,
      transactionDate: {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59),
      },
    },
  })

  const monthly: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) monthly[m] = 0

  for (const tx of txs) {
    const m = tx.transactionDate.getMonth() + 1
    monthly[m] += tx.chargedAmount
  }

  return monthly
}

/** category -> month (1-12) -> total charged, for one year */
export async function getCCCategoryMonthly(provider: CardProvider, year: number) {
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      cardProvider: provider,
      ignored: false,
      transactionDate: {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59),
      },
    },
    select: { transactionDate: true, category: true, categoryOverride: true, chargedAmount: true },
  })

  const result: Record<string, Record<number, number>> = {}
  for (const tx of txs) {
    const cat = tx.categoryOverride ?? tx.category
    const m = tx.transactionDate.getMonth() + 1
    result[cat] ??= {}
    result[cat][m] = (result[cat][m] ?? 0) + tx.chargedAmount
  }
  return result
}
