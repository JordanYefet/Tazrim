import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedCCTransaction } from '../../parsers/types'

let db: TestDb
let cards: typeof import('../cards')

// Made-up statements only: one purchase paid in 10 installments, a standing order and a regular charge
const cc = (over: Partial<ParsedCCTransaction> = {}): ParsedCCTransaction => ({
  transactionDate: new Date(2030, 0, 5),
  billingDate: new Date(2030, 1, 2),
  originalMerchantName: 'FAKE FURNITURE',
  merchantName: 'FAKE FURNITURE',
  category: 'Home',
  chargedAmount: 120,
  originalAmount: 1200,
  originalCurrency: '₪',
  cardLastFour: '',
  transactionType: 'תשלומים',
  notes: '',
  cardProvider: 'MAX',
  ...over,
})

/** The statement billed in `month` (0-based, 2030): installment `month` of the purchase, plus two other rows. */
const statement = (month: number): ParsedCCTransaction[] => [
  cc({ billingDate: new Date(2030, month, 2), notes: `תשלום ${month} מתוך 10` }),
  cc({
    transactionDate: new Date(2030, month - 1, 20),
    billingDate: new Date(2030, month, 2),
    originalMerchantName: 'FAKE STREAMING',
    merchantName: 'FAKE STREAMING',
    chargedAmount: 30,
    originalAmount: 30,
    transactionType: 'רגילה',
    notes: 'הוראת קבע',
  }),
  cc({
    transactionDate: new Date(2030, month - 1, 11),
    billingDate: new Date(2030, month, 2),
    originalMerchantName: 'FAKE CAFE',
    merchantName: 'FAKE CAFE',
    chargedAmount: 18,
    originalAmount: 18,
    transactionType: 'רגילה',
  }),
]

const count = () => db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "CreditCardTransaction"`)[0].n
const installments = () =>
  db.query<{ notes: string }>(
    `SELECT notes FROM "CreditCardTransaction" WHERE transactionType = 'תשלומים' ORDER BY billingDate`
  ).map(r => r.notes)

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  cards = await import('../cards')
})

beforeEach(() => db.exec(`DELETE FROM "CreditCardTransaction"`))

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('card import de-duplication', () => {
  it('keeps every installment when monthly statements are uploaded in any order', async () => {
    for (const month of [4, 2, 3]) {
      const res = await cards.upsertCCTransactions(statement(month), `max-${month}.xlsx`, 'acct_max')
      expect(res).toMatchObject({ created: 3, skipped: 0, skippedRows: [] })
    }
    expect(installments()).toEqual(['תשלום 2 מתוך 10', 'תשלום 3 מתוך 10', 'תשלום 4 מתוך 10'])
    expect(count()).toBe(9)
  })

  it('re-uploading a statement, under any file name, adds nothing and lists what was skipped', async () => {
    await cards.upsertCCTransactions(statement(2), 'max-2.xlsx', 'acct_max')
    for (const name of ['max-2.xlsx', 'max-2 (1).xlsx']) {
      const res = await cards.upsertCCTransactions(statement(2), name, 'acct_max')
      expect(res.created).toBe(0)
      expect(res.skipped).toBe(3)
      expect(res.skippedRows.map(r => r.merchant)).toEqual(['FAKE FURNITURE', 'FAKE STREAMING', 'FAKE CAFE'])
      expect(res.skippedRows[0]).toMatchObject({
        index: 0,
        date: '2030-01-05',
        billingDate: '2030-03-02',
        amount: 120,
        notes: 'תשלום 2 מתוך 10',
        matched: { sourceFile: 'max-2.xlsx' },
      })
    }
    expect(count()).toBe(3)
  })

  it('a re-upload restores rows that are missing, without duplicating the rest', async () => {
    await cards.upsertCCTransactions(statement(2), 'max-2.xlsx', 'acct_max')
    db.exec(`DELETE FROM "CreditCardTransaction" WHERE originalMerchantName = 'FAKE CAFE'`)
    const res = await cards.upsertCCTransactions(statement(2), 'max-2.xlsx', 'acct_max')
    expect(res).toMatchObject({ created: 1, skipped: 2 })
    expect(count()).toBe(3)
  })

  it('an overlapping export adds only its new rows', async () => {
    await cards.upsertCCTransactions(statement(2), 'max-2.xlsx', 'acct_max')
    const res = await cards.upsertCCTransactions([...statement(2), ...statement(3)], 'max-2-3.xlsx', 'acct_max')
    expect(res).toMatchObject({ created: 3, skipped: 3 })
    expect(count()).toBe(6)
  })

  it('two identical charges on one statement are both kept, and a re-upload adds neither', async () => {
    const twice = [statement(2)[2], statement(2)[2]]
    expect(await cards.upsertCCTransactions(twice, 'max-2.xlsx', 'acct_max')).toMatchObject({ created: 2, skipped: 0 })
    expect(await cards.upsertCCTransactions(twice, 'max-2.xlsx', 'acct_max')).toMatchObject({ created: 0, skipped: 2 })
    expect(count()).toBe(2)
  })

  it('imports the rows the user chose to keep, even though they match', async () => {
    await cards.upsertCCTransactions(statement(2), 'max-2.xlsx', 'acct_max')
    const res = await cards.upsertCCTransactions(statement(2), 'max-2.xlsx', 'acct_max', { force: [2] })
    expect(res).toMatchObject({ created: 1, skipped: 2 })
    expect(db.query(`SELECT COUNT(*) AS n FROM "CreditCardTransaction" WHERE originalMerchantName = 'FAKE CAFE'`)).toEqual([
      { n: 2 },
    ])
  })

  it('only compares within the same card', async () => {
    db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
      ('acct_fake_card2', 'CREDIT_CARD', 'max', 'Second fake card', 1900000000000)`)
    await cards.upsertCCTransactions(statement(2), 'max-2.xlsx', 'acct_max')
    expect(await cards.upsertCCTransactions(statement(2), 'max-2.xlsx', 'acct_fake_card2')).toMatchObject({
      created: 3,
      skipped: 0,
    })
  })
})
