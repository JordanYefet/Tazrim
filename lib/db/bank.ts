import { Prisma } from '@prisma/client'
import { prisma } from './client'
import type { ParsedBankTransaction } from '../parsers/types'

export async function upsertBankTransactions(
  transactions: ParsedBankTransaction[]
): Promise<{ created: number; skipped: number }> {
  const aliases = await prisma.transactionAlias.findMany({ where: { source: 'BANK' } })
  const aliasMap = new Map(aliases.map(a => [a.originalName, a.displayName]))

  let created = 0
  let skipped = 0

  for (const tx of transactions) {
    const existing = await prisma.bankTransaction.findFirst({
      where: {
        date: tx.date,
        originalDescription: tx.originalDescription,
        debit: tx.debit,
        credit: tx.credit,
      },
    })
    if (existing) { skipped++; continue }

    await prisma.bankTransaction.create({
      data: {
        date: tx.date,
        originalDescription: tx.originalDescription,
        description: aliasMap.get(tx.originalDescription) ?? tx.originalDescription,
        debit: tx.debit,
        credit: tx.credit,
        balance: tx.balance,
        note: tx.note,
        sourceFile: tx.sourceFile,
      },
    })
    created++
  }

  return { created, skipped }
}

export async function getBankTransactions(params: {
  month?: number
  year?: number
  search?: string
  merchant?: string
  showIgnored?: boolean
  take?: number
  skip?: number
}) {
  const where: Prisma.BankTransactionWhereInput = {}

  if (params.year) {
    const m = params.month
    where.date = {
      gte: new Date(params.year, m ? m - 1 : 0, 1),
      lte: m
        ? new Date(params.year, m, 0, 23, 59, 59)
        : new Date(params.year, 12, 0, 23, 59, 59),
    }
  }

  if (params.merchant) {
    where.description = params.merchant
  } else if (params.search) {
    where.description = { contains: params.search }
  }

  if (!params.showIgnored) {
    where.ignored = false
  }

  return prisma.bankTransaction.findMany({
    where,
    orderBy: { date: 'desc' },
    ...(params.take !== undefined ? { take: params.take } : {}),
    ...(params.skip !== undefined ? { skip: params.skip } : {}),
  })
}

export async function updateBankTransaction(
  id: string,
  data: { description?: string; note?: string; ignored?: boolean }
) {
  return prisma.bankTransaction.update({ where: { id }, data })
}

export async function getBankMonthlySummary(year: number) {
  const txs = await prisma.bankTransaction.findMany({
    where: {
      ignored: false,
      date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) },
    },
  })

  const monthly: Record<number, { income: number; expense: number }> = {}
  for (let m = 1; m <= 12; m++) monthly[m] = { income: 0, expense: 0 }

  for (const tx of txs) {
    const m = tx.date.getMonth() + 1
    monthly[m].income += tx.credit
    monthly[m].expense += tx.debit
  }

  return monthly
}
