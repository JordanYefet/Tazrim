import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

// Made-up merchants, notes and categories only.
let db: TestDb
let backfills: typeof import('../backfills')
let prisma: typeof import('../client')['prisma']

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  backfills = await import('../backfills')
  prisma = (await import('../client')).prisma
  await prisma.category.createMany({ data: [{ name: 'Fake Therapy', kind: 'EXPENSE' }] })
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const card = (id: string, notes: string) =>
  prisma.creditCardTransaction.create({
    data: {
      id,
      accountId: 'acct_max',
      transactionDate: new Date(2030, 1, 1),
      billingDate: new Date(2030, 2, 2),
      originalMerchantName: 'FAKEPAY',
      merchantName: 'FAKEPAY',
      category: '',
      chargedAmount: 10,
      originalAmount: 10,
      originalCurrency: '₪',
      cardLastFour: '',
      transactionType: '',
      notes,
    },
  })

describe('runBackfills', () => {
  it('applies the text rules to rows stored before, by their notes, once', async () => {
    // Stored before the rules matched notes: the rule existed but did not reach it
    await prisma.categoryKeywordRule.create({ data: { pattern: 'Dana', category: 'Fake Therapy' } })
    await card('c1', 'Dana Example')
    await card('c2', 'Someone Else')

    expect(await backfills.runBackfills()).toEqual({ ran: true, changed: 1 })
    const rows = await prisma.creditCardTransaction.findMany({ orderBy: { id: 'asc' }, select: { categoryOverride: true } })
    expect(rows.map(r => r.categoryOverride)).toEqual(['Fake Therapy', null])

    expect(await backfills.runBackfills()).toEqual({ ran: false, changed: 0 })
  })
})
