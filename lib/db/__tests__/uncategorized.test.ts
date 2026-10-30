import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import { parseSearchParams } from '../../search/query'

// Transactions without a category, in search and as a count. Made-up values only.
let db: TestDb
let search: typeof import('../search')
let uncategorized: typeof import('../uncategorized')
let prisma: typeof import('../client')['prisma']

let seq = 0
async function bank(description: string, over: Record<string, unknown> = {}) {
  const id = `b${++seq}`
  await prisma.bankTransaction.create({
    data: {
      id,
      accountId: 'acct_leumi',
      date: new Date(2030, 1, seq),
      originalDescription: description,
      description,
      debit: 100,
      credit: 0,
      balance: 1000,
      sourceFile: 'fake.xls',
      ...over,
    },
  })
  return id
}
async function card(category: string, over: Record<string, unknown> = {}) {
  const id = `c${++seq}`
  await prisma.creditCardTransaction.create({
    data: {
      id,
      accountId: 'acct_max',
      transactionDate: new Date(2030, 1, seq),
      billingDate: new Date(2030, 2, 2),
      originalMerchantName: `FAKE SHOP ${seq}`,
      merchantName: `FAKE SHOP ${seq}`,
      category,
      chargedAmount: 10,
      originalAmount: 10,
      originalCurrency: 'ILS',
      cardLastFour: '',
      transactionType: 'regular',
      ...over,
    },
  })
  return id
}

const T: Record<string, string> = {}

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  search = await import('../search')
  uncategorized = await import('../uncategorized')
  prisma = (await import('../client')).prisma
  await prisma.category.create({ data: { name: 'Fake Food', kind: 'EXPENSE' } })

  T.bankNone = await bank('FAKE PLUMBER')
  T.bankIncomeNone = await bank('FAKE REFUND', { debit: 0, credit: 50 })
  T.bankSet = await bank('FAKE WATER', { category: 'Fake Food' })
  // The card payment never takes a category: not "uncategorized"
  T.bankPayment = await bank('FAKE MAX PAYMENT')
  T.bankIgnored = await bank('FAKE IGNORED', { ignored: true })

  // A card row is uncategorized while its category is none of yours (the issuer's own, unmapped)
  T.cardIssuer = await card('FAKE ISSUER FOOD')
  T.cardMine = await card('Fake Food')
  T.cardOverride = await card('FAKE ISSUER FOOD', { categoryOverride: 'Fake Food' })
  T.cardIgnored = await card('FAKE ISSUER FOOD', { ignored: true })
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('uncategorized transactions', () => {
  it('search with uncategorized=1 finds bank rows without a category and card rows outside your categories', async () => {
    const page = await search.searchTransactions(parseSearchParams({ uncategorized: '1' }))
    expect(page.results.map(r => r.id).sort()).toEqual([T.bankIncomeNone, T.bankNone, T.cardIssuer].sort())
    expect(page.total).toBe(3)
  })

  it('combines with the other filters', async () => {
    const page = await search.searchTransactions(parseSearchParams({ uncategorized: '1', account: 'acct_max' }))
    expect(page.results.map(r => r.id)).toEqual([T.cardIssuer])
  })

  it('counts them per source, for the overview', async () => {
    expect(await uncategorized.countUncategorized()).toEqual({ bank: 2, card: 1 })
    expect(await uncategorized.countUncategorized(['acct_leumi'])).toEqual({ bank: 2, card: 0 })
  })
})
