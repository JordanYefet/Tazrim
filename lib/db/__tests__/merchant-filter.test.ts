import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'
import { UNCATEGORIZED } from '../../insights/bank-categories'

// ENG-83: a merchant or search filter on an account page reaches its charts and
// tiles, not only the table. Made-up values only.
let db: TestDb
let cards: typeof import('../cards')
let bank: typeof import('../bank')
let bankCats: typeof import('../bank-categories')

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
  bank = await import('../bank')
  bankCats = await import('../bank-categories')

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

  await bank.upsertBankTransactions(
    [
      row({ debit: 120 }),
      row({ date: new Date(2030, 2, 10), debit: 80 }),
      row({ originalDescription: 'FAKE SALARY', description: 'FAKE SALARY', credit: 5000 }),
      row({ originalDescription: 'FAKE LANDLORD PLUS', description: 'FAKE LANDLORD PLUS', debit: 3000 }),
    ],
    'acct_leumi'
  )
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const row = (over: Partial<ParsedBankTransaction> = {}): ParsedBankTransaction => ({
  date: new Date(2030, 1, 10),
  originalDescription: 'FAKE LANDLORD',
  description: 'FAKE LANDLORD',
  debit: 0,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'fake-merchant.xlsx',
  ...over,
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

  it('a search matches part of the name, every merchant that contains it', async () => {
    expect(await cards.getCCCategoryStats('acct_max', 2030, undefined, { search: 'GROCER' })).toEqual({
      Food: { total: 40, count: 2 },
      Home: { total: 70, count: 1 },
    })
    expect(await cards.getCCMonthlySummary('acct_max', 2030, { search: 'GROCER' })).toMatchObject({ 2: 80, 3: 30 })
    expect(await cards.getCCMonthlyCounts('acct_max', 2030, { search: 'GROCER' })).toMatchObject({ 2: 2, 3: 1 })
    expect(await cards.getCCCategoryMonthly('acct_max', 2030, { search: 'GROCER' })).toEqual({
      Food: { 2: 10, 3: 30 },
      Home: { 2: 70 },
    })
  })

  it('an exact merchant wins over a search, as in the table', async () => {
    expect(await cards.getCCCategoryStats('acct_max', 2030, undefined, { merchant, search: 'FUEL' })).toEqual({
      Food: { total: 40, count: 2 },
    })
  })
})

describe('merchant and search filters on the bank charts', () => {
  it('getBankMonthlySummary', async () => {
    const m = await bank.getBankMonthlySummary(2030, 'acct_leumi', { merchant: 'FAKE LANDLORD' })
    expect(m[2]).toEqual({ income: 0, expense: 120 })
    expect(m[3]).toEqual({ income: 0, expense: 80 })
    expect((await bank.getBankMonthlySummary(2030, 'acct_leumi', { search: 'LANDLORD' }))[2]).toEqual({ income: 0, expense: 3120 })
    expect((await bank.getBankMonthlySummary(2030, 'acct_leumi'))[2]).toEqual({ income: 5000, expense: 3120 })
  })

  it('getBankMonthlySummary with a category: only rows in that bucket', async () => {
    db.exec(`UPDATE "BankTransaction" SET category = 'Fake Rent' WHERE description = 'FAKE LANDLORD'`)
    try {
      const m = await bank.getBankMonthlySummary(2030, 'acct_leumi', { category: 'Fake Rent' })
      expect(m[2]).toEqual({ income: 0, expense: 120 })
      expect(m[3]).toEqual({ income: 0, expense: 80 })
      // Rows without a category count under the uncategorized bucket, both directions
      expect((await bank.getBankMonthlySummary(2030, 'acct_leumi', { category: UNCATEGORIZED }))[2]).toEqual({
        income: 5000,
        expense: 3000,
      })
      // With a merchant too: both apply
      expect((await bank.getBankMonthlySummary(2030, 'acct_leumi', { category: 'Fake Rent', search: 'PLUS' }))[2]).toEqual({
        income: 0,
        expense: 0,
      })
    } finally {
      db.exec(`UPDATE "BankTransaction" SET category = NULL`)
    }
  })

  it('getBankCategoryStats', async () => {
    const count = (s: Record<string, { count: number }>) => Object.values(s).reduce((n, v) => n + v.count, 0)
    expect(count(await bankCats.getBankCategoryStats('acct_leumi', 2030, undefined, 'OUT', { merchant: 'FAKE LANDLORD' }))).toBe(2)
    expect(count(await bankCats.getBankCategoryStats('acct_leumi', 2030, undefined, 'OUT', { search: 'LANDLORD' }))).toBe(3)
    expect(await bankCats.getBankCategoryStats('acct_leumi', 2030, undefined, 'IN', { merchant: 'FAKE LANDLORD' })).toEqual({})
    expect(count(await bankCats.getBankCategoryStats('acct_leumi', 2030, undefined, 'IN'))).toBe(1)
  })
})
