import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedCCTransaction } from '../../parsers/types'

// ENG-83: a merchant filter on the card page reaches its charts and tiles, not
// only the table. Made-up values only.
let db: TestDb
let cards: typeof import('../cards')

const cc = (over: Partial<ParsedCCTransaction>): ParsedCCTransaction => ({
  transactionDate: new Date(2030, 0, 10),
  billingDate: new Date(2030, 1, 2),
  originalMerchantName: 'FAKE GROCER',
  merchantName: 'FAKE GROCER',
  category: 'Food',
  chargedAmount: 10,
  originalAmount: 10,
  originalCurrency: 'ILS',
  cardLastFour: '',
  transactionType: 'regular',
  notes: '',
  cardProvider: 'MAX',
  ...over,
})

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  cards = await import('../cards')

  await cards.upsertCCTransactions(
    [
      // The grocer: February and March
      cc({}),
      cc({ transactionDate: new Date(2030, 1, 12), billingDate: new Date(2030, 2, 2), chargedAmount: 30 }),
      // Ignored grocer charge: never counted
      cc({ transactionDate: new Date(2030, 1, 13), billingDate: new Date(2030, 2, 2), chargedAmount: 500 }),
      // Other merchants in other categories, same months
      cc({ originalMerchantName: 'FAKE FUEL', merchantName: 'FAKE FUEL', category: 'Car', chargedAmount: 200 }),
      cc({ originalMerchantName: 'FAKE GROCER PLUS', merchantName: 'FAKE GROCER PLUS', category: 'Home', chargedAmount: 70 }),
    ],
    'max-merchant.xlsx',
    'acct_max'
  )
  db.exec(`UPDATE "CreditCardTransaction" SET ignored = 1 WHERE chargedAmount = 500`)
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const merchant = 'FAKE GROCER'

describe('merchant filter on the card charts', () => {
  it('getCCCategoryStats: only that merchant (an exact name, not a prefix)', async () => {
    expect(await cards.getCCCategoryStats('acct_max', 2030, undefined, { merchant })).toEqual({
      Food: { total: 40, count: 2 },
    })
    expect(await cards.getCCCategoryStats('acct_max', 2030, 3, { merchant })).toEqual({
      Food: { total: 30, count: 1 },
    })
  })

  it('getCCMonthlySummary', async () => {
    expect(await cards.getCCMonthlySummary('acct_max', 2030, { merchant })).toMatchObject({ 1: 0, 2: 10, 3: 30 })
  })

  it('getCCMonthlyCounts', async () => {
    expect(await cards.getCCMonthlyCounts('acct_max', 2030, { merchant })).toMatchObject({ 2: 1, 3: 1 })
    expect(await cards.getCCMonthlyCounts('acct_max', 2030, { merchant, category: 'Car' })).toMatchObject({ 2: 0, 3: 0 })
  })

  it('getCCCategoryMonthly', async () => {
    expect(await cards.getCCCategoryMonthly('acct_max', 2030, { merchant })).toEqual({ Food: { 2: 10, 3: 30 } })
  })

  it('without a merchant, every merchant as before', async () => {
    expect(await cards.getCCCategoryStats('acct_max', 2030)).toEqual({
      Food: { total: 40, count: 2 },
      Car: { total: 200, count: 1 },
      Home: { total: 70, count: 1 },
    })
  })
})
