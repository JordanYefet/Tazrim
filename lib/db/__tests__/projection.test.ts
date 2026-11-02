// lib/db/__tests__/projection.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'

let db: TestDb
let bank: typeof import('../bank')
let cards: typeof import('../cards')
let projection: typeof import('../projection')

// Made-up rows only. Bank 1 (acct_leumi) pays the MAX card; bank 2 has its own salary.
const bt = (month: number, over: Partial<ParsedBankTransaction> = {}): ParsedBankTransaction => ({
  date: new Date(2030, month - 1, 15),
  originalDescription: 'RENTCO',
  description: 'RENTCO',
  debit: 0,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'bank-test.xls',
  ...over,
})
const cc = (month: number, over: Partial<ParsedCCTransaction> = {}): ParsedCCTransaction => ({
  transactionDate: new Date(2030, month - 1, 5),
  billingDate: new Date(2030, month, 2),
  originalMerchantName: 'SHOPCO',
  merchantName: 'SHOPCO',
  category: 'Shopping',
  chargedAmount: 300,
  originalAmount: 300,
  originalCurrency: 'ILS',
  cardLastFour: '',
  transactionType: 'regular',
  notes: '',
  cardProvider: 'MAX',
  ...over,
})
const months = [1, 2, 3, 4, 5, 6, 7]

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES ('acct_bank2','BANK','leumi','Second bank',1900000000000);
UPDATE "Account" SET "payerAccountId"='acct_leumi' WHERE "id"='acct_max';
`)
  usePrismaOn(db)
  bank = await import('../bank')
  cards = await import('../cards')
  projection = await import('../projection')
  await bank.upsertBankTransactions(
    [
      ...months.map(m => bt(m, { originalDescription: 'SALARYCO', description: 'SALARYCO', credit: 9000, date: new Date(2030, m - 1, 1), balance: 1000 + m * 100 })),
      ...months.map(m => bt(m, { debit: 4000, date: new Date(2030, m - 1, 9), balance: 900 + m * 100 })),
      ...months.map(m => bt(m, { originalDescription: 'מקס איט פיננסים', description: 'מקס איט פיננסים', debit: 300, date: new Date(2030, m - 1, 10), balance: 800 + m * 100 })),
    ],
    'acct_leumi'
  )
  await bank.upsertBankTransactions(
    months.map(m => bt(m, { originalDescription: 'OTHERJOB', description: 'OTHERJOB', credit: 2000, date: new Date(2030, m - 1, 3), balance: 5000 + m * 2000 })),
    'acct_bank2'
  )
  await cards.upsertCCTransactions(months.map(m => cc(m)), 'card.xlsx', 'acct_max')
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const today = new Date(2030, 6, 20)

describe('getProjection', () => {
  it('combines every bank: starts from the sum of the latest balances', async () => {
    const p = await projection.getProjection({ today })
    if (p.insufficient) throw new Error('expected a projection')
    // latest rows: acct_leumi 800+700 (card payment on the 10th is its last row), acct_bank2 5000+14000
    expect(p.start).toEqual({ balance: 1500 + 19000, date: '2030-07-10' })
    expect(p.accountId).toBeNull()
    expect(p.banks.map(b => b.id).sort()).toEqual(['acct_bank2', 'acct_leumi'])
    expect(p.months[0].income).toBe(9000 + 2000)
  })

  it('one bank: only its rows and the cards it pays', async () => {
    const p = await projection.getProjection({ accountId: 'acct_bank2', today })
    if (p.insufficient) throw new Error('expected a projection')
    expect(p.accountId).toBe('acct_bank2')
    expect(p.start.balance).toBe(19000)
    expect(p.months[0].income).toBe(2000)
    expect(p.months[0].expense).toBe(0)
  })

  it('falls back to every bank for an unknown account id', async () => {
    const p = await projection.getProjection({ accountId: 'nope', today })
    expect(p.accountId).toBeNull()
  })

  it('uses the saved cushion', async () => {
    const settings = await import('../settings')
    await settings.setCushion(999999)
    const p = await projection.getProjection({ today })
    if (p.insufficient) throw new Error('expected a projection')
    expect(p.cushion).toBe(999999)
    expect(p.tight.length).toBe(p.months.length)
    await settings.setCushion(0)
  })

  it('draws the last months’ actual month-end balance', async () => {
    const p = await projection.getProjection({ today })
    if (p.insufficient) throw new Error('expected a projection')
    expect(p.past.at(-1)).toEqual({ month: '2030-07', balance: 1500 + 19000 })
  })

  it('judges the recurring series as of the given day, not the data or the clock', async () => {
    // A year after the data every series has lapsed: none is projected any more.
    // (Without `today` the rent series stays active and still adds 4000 a month.)
    const p = await projection.getProjection({ today: new Date(2031, 5, 20) })
    if (p.insufficient) throw new Error('expected a projection')
    expect(p.months[0].expense).toBe(0)
    expect(p.months[0].income).toBe(9000 + 2000)
  })

  it('one bank: the cards it pays are in scope', async () => {
    const p = await projection.getProjection({ accountId: 'acct_leumi', today })
    if (p.insufficient) throw new Error('expected a projection')
    // With the MAX card in scope its monthly shop charge is a recurring card series,
    // paid by the bank the month after: absent in Aug (4000 rent), present from Sep (+300).
    // Without the card the 300 would be everyday spending, in every month including Aug.
    expect(p.months[0].expense).toBe(4000)
    expect(p.months[1].expense).toBe(4300)
  })
})
