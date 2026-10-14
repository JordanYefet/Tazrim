import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedCCTransaction } from '../../parsers/types'

// ENG-46: card charges belong to the month they are billed in (when the bank
// pays the card), not the purchase month. Made-up values only.
let db: TestDb
let cards: typeof import('../cards')
let summary: typeof import('../summary')

const cc = (over: Partial<ParsedCCTransaction>): ParsedCCTransaction => ({
  transactionDate: new Date(2030, 5, 10),
  billingDate: new Date(2030, 6, 2),
  originalMerchantName: 'FAKE STORE',
  merchantName: 'FAKE STORE',
  category: 'Home',
  chargedAmount: 10,
  originalAmount: 10,
  originalCurrency: 'ILS',
  cardLastFour: '',
  transactionType: 'regular',
  notes: '',
  cardProvider: 'MAX',
  ...over,
})

const june = new Date(2030, 5, 10)
const installment = (n: number, billingMonth: number) =>
  cc({
    transactionDate: june,
    billingDate: new Date(2030, billingMonth - 1, 2),
    originalMerchantName: 'FAKE FURNITURE',
    merchantName: 'FAKE FURNITURE',
    category: 'Furniture',
    chargedAmount: 100,
    originalAmount: 300,
    transactionType: 'installments',
    notes: `תשלום ${n} מתוך 3`,
  })

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  cards = await import('../cards')
  summary = await import('../summary')

  await cards.upsertCCTransactions(
    [
      // A June purchase in three installments, billed July, August and September
      installment(1, 7),
      installment(2, 8),
      installment(3, 9),
      // A regular June charge billed in September (billing month != purchase month)
      cc({ transactionDate: new Date(2030, 5, 20), billingDate: new Date(2030, 8, 2), chargedAmount: 40 }),
      // A regular September charge billed in October
      cc({ transactionDate: new Date(2030, 8, 15), billingDate: new Date(2030, 9, 2), chargedAmount: 7 }),
      // A December purchase billed the next January: belongs to the next year
      cc({ transactionDate: new Date(2030, 11, 20), billingDate: new Date(2031, 0, 2), chargedAmount: 5 }),
    ],
    'max-billing.xlsx',
    'acct_max'
  )
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('card charges are bucketed by billing month', () => {
  it('getCCMonthlySummary', async () => {
    const m = await cards.getCCMonthlySummary('acct_max', 2030)
    expect(m[6]).toBe(0)
    expect(m[7]).toBe(100)
    expect(m[8]).toBe(100)
    expect(m[9]).toBe(100 + 40)
    expect(m[10]).toBe(7)
    expect(m[12]).toBe(0)
    expect((await cards.getCCMonthlySummary('acct_max', 2031))[1]).toBe(5)
  })

  it('getCCTransactions month and year filters, newest billing first', async () => {
    expect(await cards.getCCTransactions({ accountId: 'acct_max', year: 2030, month: 6 })).toEqual([])
    const sept = await cards.getCCTransactions({ accountId: 'acct_max', year: 2030, month: 9 })
    expect(sept.map(t => [t.chargedAmount, t.transactionDate.getMonth() + 1])).toEqual([
      [40, 6], // same billing day: later purchase first
      [100, 6],
    ])
    const year = await cards.getCCTransactions({ accountId: 'acct_max', year: 2030 })
    expect(year.map(t => t.billingDate.getMonth() + 1)).toEqual([10, 9, 9, 8, 7])
    expect((await cards.getCCTransactions({ accountId: 'acct_max', year: 2031 })).map(t => t.chargedAmount)).toEqual([5])
  })

  it('getCCCategoryStats and getCCCategorySummary', async () => {
    expect(await cards.getCCCategoryStats('acct_max', 2030, 6)).toEqual({})
    expect(await cards.getCCCategoryStats('acct_max', 2030, 9)).toEqual({
      Furniture: { total: 100, count: 1 },
      Home: { total: 40, count: 1 },
    })
    expect(await cards.getCCCategoryStats('acct_max', 2030)).toEqual({
      Furniture: { total: 300, count: 3 },
      Home: { total: 47, count: 2 },
    })
    expect(await cards.getCCCategorySummary('acct_max', 2030, 6)).toEqual({})
    expect(await cards.getCCCategorySummary('acct_max', 2030, 9)).toEqual({ Furniture: 100, Home: 40 })
  })

  it('getCCCategoryMonthly', async () => {
    expect(await cards.getCCCategoryMonthly('acct_max', 2030)).toEqual({
      Furniture: { 7: 100, 8: 100, 9: 100 },
      Home: { 9: 40, 10: 7 },
    })
  })

  it('getYearSummary card totals', async () => {
    const s = await summary.getYearSummary(2030)
    expect(s.cards[6]).toBe(0)
    expect(s.cards[9]).toBe(140)
    expect(s.byAccount.acct_max.monthly[9]).toBe(140)
    expect(s.max[9]).toBe(140)
    expect((await summary.getYearSummary(2031)).cards[1]).toBe(5)
  })
})
