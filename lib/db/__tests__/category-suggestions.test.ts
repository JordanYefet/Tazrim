import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction } from '../../parsers/types'

let db: TestDb
let bank: typeof import('../bank')
let suggestions: typeof import('../category-suggestions')

// Made-up rows only
const row = (day: number, over: Partial<ParsedBankTransaction> = {}): ParsedBankTransaction => ({
  date: new Date(2030, 1, day),
  originalDescription: 'FAKE CHEQUE',
  description: 'FAKE CHEQUE',
  debit: 0,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'fake.xlsx',
  ...over,
})

const setCategory = (description: string, day: number, category: string) =>
  db.exec(
    `UPDATE "BankTransaction" SET category = '${category}'
     WHERE originalDescription = '${description}' AND date = ${new Date(2030, 1, day).getTime()}`
  )

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
    ('acct_fake_other', 'BANK', 'otherbank', 'Other fake bank', 1900000000000);`)
  usePrismaOn(db)
  bank = await import('../bank')
  suggestions = await import('../category-suggestions')
})

beforeEach(() => db.exec(`DELETE FROM "BankTransaction";`))

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('withCategorySuggestions', () => {
  it("adds each uncategorized row's suggestion from the history of every account", async () => {
    await bank.upsertBankTransactions(
      [
        row(1, { debit: 200 }),
        row(2, { debit: 1000 }),
        row(3, { originalDescription: 'FAKE TRANSFER', description: 'FAKE TRANSFER', credit: 300 }),
        // The page's rows
        row(20, { debit: 204 }),
        row(21, { debit: 500 }),
        row(22, { originalDescription: 'FAKE TRANSFER', description: 'FAKE TRANSFER', credit: 300 }),
      ],
      'acct_leumi'
    )
    await bank.upsertBankTransactions([row(4, { debit: 1010 })], 'acct_fake_other')
    setCategory('FAKE CHEQUE', 1, 'Fake Insurance')
    setCategory('FAKE CHEQUE', 4, 'Fake School')
    setCategory('FAKE TRANSFER', 3, 'Fake Rent In')
    db.exec(`UPDATE "BankTransaction" SET ignored = 1 WHERE originalDescription = 'FAKE TRANSFER' AND credit = 300 AND date = ${new Date(2030, 1, 3).getTime()}`)

    const page = await bank.getBankTransactions({ accountId: 'acct_leumi', year: 2030, take: 3 })
    const out = await suggestions.withCategorySuggestions(page)
    const byDay = Object.fromEntries(out.map(r => [r.date.getDate(), r.suggestion]))

    expect(byDay[20]).toEqual({ category: 'Fake Insurance', fromAmount: 200, fromDate: new Date(2030, 1, 1) })
    // Nothing near 500; the transfer's only categorized match is ignored
    expect(byDay[21]).toBeUndefined()
    expect(byDay[22]).toBeUndefined()
  })

  it('suggests across accounts, and keeps rows that need none untouched', async () => {
    await bank.upsertBankTransactions([row(2, { debit: 1000 })], 'acct_leumi')
    await bank.upsertBankTransactions([row(4, { debit: 1010 })], 'acct_fake_other')
    setCategory('FAKE CHEQUE', 4, 'Fake School')
    const rows = await bank.getBankTransactions({ year: 2030 })
    const out = await suggestions.withCategorySuggestions(rows)
    const byDay = Object.fromEntries(out.map(r => [r.date.getDate(), r]))
    expect(byDay[2].suggestion?.category).toBe('Fake School')
    expect(byDay[4].suggestion).toBeUndefined()
    expect(byDay[4].category).toBe('Fake School')
  })

  it('makes no query without a row to suggest for', async () => {
    expect(await suggestions.withCategorySuggestions([])).toEqual([])
  })
})
