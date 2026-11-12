import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'

// A category's rows over a year, bank and cards together. Made-up values only.
let db: TestDb
let categoryYear: typeof import('../category-year')

const cc = (over: Partial<ParsedCCTransaction>): ParsedCCTransaction => ({
  transactionDate: new Date(2030, 0, 10),
  billingDate: new Date(2030, 1, 2),
  originalMerchantName: 'FAKE STORE',
  merchantName: 'FAKE STORE',
  category: 'Fake Food',
  chargedAmount: 10,
  originalAmount: 10,
  originalCurrency: 'ILS',
  cardLastFour: '',
  transactionType: 'regular',
  notes: '',
  cardProvider: 'MAX',
  ...over,
})

const bankRow = (over: Partial<ParsedBankTransaction> = {}): ParsedBankTransaction => ({
  date: new Date(2030, 2, 10),
  originalDescription: 'FAKE MARKET',
  description: 'FAKE MARKET',
  debit: 0,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'fake.xlsx',
  ...over,
})

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Category" ("id","name","kind") VALUES ('k1','Fake Food','EXPENSE'), ('k2','Fake Salary','INCOME');`)
  usePrismaOn(db)
  const cards = await import('../cards')
  const bank = await import('../bank')
  categoryYear = await import('../category-year')

  await cards.upsertCCTransactions(
    [
      // Bought in January, billed in February: a February row
      cc({ originalMerchantName: 'FAKE STORE', merchantName: 'FAKE STORE', chargedAmount: 100 }),
      // The override wins over the statement category
      cc({ transactionDate: new Date(2030, 2, 5), billingDate: new Date(2030, 3, 2), originalMerchantName: 'FAKE OTHER', merchantName: 'FAKE OTHER', category: 'Fake Else', chargedAmount: 40 }),
      // A statement category that an override moved away
      cc({ transactionDate: new Date(2030, 2, 6), billingDate: new Date(2030, 3, 2), originalMerchantName: 'FAKE MOVED', merchantName: 'FAKE MOVED', chargedAmount: 70 }),
      // Billed next year: not in 2030
      cc({ transactionDate: new Date(2030, 11, 20), billingDate: new Date(2031, 0, 2), originalMerchantName: 'FAKE STORE', merchantName: 'FAKE STORE', chargedAmount: 55 }),
      // Ignored below
      cc({ transactionDate: new Date(2030, 4, 1), billingDate: new Date(2030, 5, 2), originalMerchantName: 'FAKE HIDDEN', merchantName: 'FAKE HIDDEN', chargedAmount: 999 }),
    ],
    'max-year.xlsx',
    'acct_max'
  )
  db.exec(`UPDATE "CreditCardTransaction" SET categoryOverride = 'Fake Food' WHERE originalMerchantName = 'FAKE OTHER'`)
  db.exec(`UPDATE "CreditCardTransaction" SET categoryOverride = 'Fake Else' WHERE originalMerchantName = 'FAKE MOVED'`)
  db.exec(`UPDATE "CreditCardTransaction" SET ignored = 1 WHERE originalMerchantName = 'FAKE HIDDEN'`)

  await bank.upsertBankTransactions(
    [
      bankRow({ date: new Date(2030, 2, 10), debit: 60 }),
      // The same text coming in is not spending
      bankRow({ date: new Date(2030, 2, 11), credit: 25 }),
      bankRow({ date: new Date(2030, 6, 1), originalDescription: 'FAKE EMPLOYER', description: 'FAKE EMPLOYER', credit: 9000 }),
      bankRow({ date: new Date(2030, 7, 1), originalDescription: 'FAKE EMPLOYER', description: 'FAKE EMPLOYER', credit: 9100 }),
    ],
    'acct_leumi'
  )
  db.exec(`UPDATE "BankTransaction" SET category = 'Fake Food' WHERE originalDescription = 'FAKE MARKET'`)
  db.exec(`UPDATE "BankTransaction" SET category = 'Fake Salary' WHERE originalDescription = 'FAKE EMPLOYER'`)
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('getCategoryYearRows', () => {
  it('reads an expense category from both tables: cards by billing month, the bank by date, overrides first, ignored rows out', async () => {
    const rows = await categoryYear.getCategoryYearRows({ bankIds: ['acct_leumi'], cardIds: ['acct_max'], year: 2030, category: 'Fake Food', kind: 'EXPENSE' })
    expect(rows.map(r => [r.source, r.description, r.month, r.amount]).sort()).toEqual(
      [
        ['card', 'FAKE STORE', 2, 100],
        ['card', 'FAKE OTHER', 4, 40],
        ['bank', 'FAKE MARKET', 3, 60],
      ].sort()
    )
    const card = rows.find(r => r.source === 'card' && r.description === 'FAKE STORE')!
    // The day shown is the purchase; the month it counts in is the billing month
    expect(card.date).toBe('2030-01-10')
    expect(card.accountName).toBe('מקס')
    expect(card.category).toBe('Fake Food')
    const bank = rows.find(r => r.source === 'bank')!
    expect(bank).toMatchObject({ date: '2030-03-10', accountName: 'בנק לאומי', category: 'Fake Food' })
  })

  it('reads an income category from the bank only, as money in', async () => {
    const rows = await categoryYear.getCategoryYearRows({ bankIds: ['acct_leumi'], cardIds: ['acct_max'], year: 2030, category: 'Fake Salary', kind: 'INCOME' })
    expect(rows.map(r => [r.month, r.amount])).toEqual([
      [7, -9000],
      [8, -9100],
    ])
  })

  it('follows the scope: no bank accounts, no bank rows', async () => {
    const rows = await categoryYear.getCategoryYearRows({ bankIds: [], cardIds: ['acct_max'], year: 2030, category: 'Fake Food', kind: 'EXPENSE' })
    expect(rows.every(r => r.source === 'card')).toBe(true)
    expect(rows).toHaveLength(2)
  })
})

describe('getMerchantYear', () => {
  it("a card row's merchant over the year, by billing month, the next year's charge left out", async () => {
    const id = db.query<{ id: string }>(`SELECT id FROM "CreditCardTransaction" WHERE originalMerchantName = 'FAKE STORE' ORDER BY billingDate LIMIT 1`)[0].id
    const m = await categoryYear.getMerchantYear({ source: 'card', id, year: 2030 })
    expect(m).toMatchObject({ name: 'FAKE STORE', year: 2030, total: 100, count: 1 })
    expect(m!.months[2]).toBe(100)
    expect(Object.keys(m!.months)).toHaveLength(12)
  })

  it("a bank row's description over the year, in its direction only", async () => {
    const id = db.query<{ id: string }>(`SELECT id FROM "BankTransaction" WHERE originalDescription = 'FAKE MARKET' AND debit > 0`)[0].id
    const m = await categoryYear.getMerchantYear({ source: 'bank', id, year: 2030 })
    expect(m).toMatchObject({ name: 'FAKE MARKET', total: 60, count: 1 })
    const salary = db.query<{ id: string }>(`SELECT id FROM "BankTransaction" WHERE originalDescription = 'FAKE EMPLOYER' LIMIT 1`)[0].id
    const s = await categoryYear.getMerchantYear({ source: 'bank', id: salary, year: 2030 })
    expect(s).toMatchObject({ total: 18100, count: 2 })
    expect(s!.months[8]).toBe(9100)
  })

  it('null for a row that does not exist', async () => {
    expect(await categoryYear.getMerchantYear({ source: 'card', id: 'nope', year: 2030 })).toBeNull()
  })
})
