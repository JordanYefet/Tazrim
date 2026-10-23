import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedCCTransaction } from '../../parsers/types'

// Charges per billing month, for the count tile's mini chart. Made-up values only.
let db: TestDb
let cards: typeof import('../cards')

const cc = (over: Partial<ParsedCCTransaction>): ParsedCCTransaction => ({
  transactionDate: new Date(2030, 0, 10),
  billingDate: new Date(2030, 1, 2),
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

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
  ('acct_test_card2', 'CREDIT_CARD', 'max', 'Second test card', 1900000000000);
`)
  usePrismaOn(db)
  cards = await import('../cards')

  await cards.upsertCCTransactions(
    [
      // Two charges billed in February, one in March (bought in February)
      cc({ originalMerchantName: 'FAKE A', merchantName: 'FAKE A' }),
      cc({ originalMerchantName: 'FAKE B', merchantName: 'FAKE B', category: 'Food' }),
      cc({ transactionDate: new Date(2030, 1, 20), billingDate: new Date(2030, 2, 2), originalMerchantName: 'FAKE C', merchantName: 'FAKE C' }),
      // Billed the next year: not in 2030
      cc({ transactionDate: new Date(2030, 11, 20), billingDate: new Date(2031, 0, 2), originalMerchantName: 'FAKE D', merchantName: 'FAKE D' }),
      // Ignored below
      cc({ transactionDate: new Date(2030, 1, 21), billingDate: new Date(2030, 2, 2), originalMerchantName: 'FAKE E', merchantName: 'FAKE E' }),
    ],
    'max-counts.xlsx',
    'acct_max'
  )
  await cards.upsertCCTransactions(
    [cc({ transactionDate: new Date(2030, 3, 5), billingDate: new Date(2030, 4, 2), originalMerchantName: 'FAKE F', merchantName: 'FAKE F' })],
    'card2-counts.xlsx',
    'acct_test_card2'
  )
  db.exec(`UPDATE "CreditCardTransaction" SET ignored = 1 WHERE originalMerchantName = 'FAKE E'`)
  // An override moves a charge to another category
  db.exec(`UPDATE "CreditCardTransaction" SET categoryOverride = 'Food' WHERE originalMerchantName = 'FAKE C'`)
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('getCCMonthlyCounts', () => {
  it('counts the non-ignored charges per billing month, with every month present', async () => {
    const counts = await cards.getCCMonthlyCounts('acct_max', 2030)
    expect(Object.keys(counts)).toHaveLength(12)
    expect(counts).toMatchObject({ 1: 0, 2: 2, 3: 1, 5: 0, 12: 0 })
  })

  it('reads one card, several cards or every card', async () => {
    expect((await cards.getCCMonthlyCounts('acct_test_card2', 2030))[5]).toBe(1)
    const both = await cards.getCCMonthlyCounts(['acct_max', 'acct_test_card2'], 2030)
    expect(both).toMatchObject({ 2: 2, 3: 1, 5: 1 })
    expect(await cards.getCCMonthlyCounts(undefined, 2030)).toEqual(both)
    expect((await cards.getCCMonthlyCounts('acct_max', 2031))[1]).toBe(1)
  })

  it('matches the months of getCCMonthlySummary', async () => {
    const counts = await cards.getCCMonthlyCounts('acct_max', 2030)
    const totals = await cards.getCCMonthlySummary('acct_max', 2030)
    for (let m = 1; m <= 12; m++) expect(counts[m] > 0).toBe(totals[m] > 0)
  })

  it('counts one category, by its override when there is one', async () => {
    expect(await cards.getCCMonthlyCounts('acct_max', 2030, { category: 'Food' })).toMatchObject({ 2: 1, 3: 1 })
    expect(await cards.getCCMonthlyCounts('acct_max', 2030, { category: 'Home' })).toMatchObject({ 2: 1, 3: 0 })
  })
})
