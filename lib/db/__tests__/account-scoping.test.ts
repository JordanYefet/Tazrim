import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'

let db: TestDb
let bank: typeof import('../bank')
let cards: typeof import('../cards')
let upload: typeof import('../upload')

// Made-up rows only
const cc = (over: Partial<ParsedCCTransaction> = {}): ParsedCCTransaction => ({
  transactionDate: new Date(2030, 0, 5),
  billingDate: new Date(2030, 1, 2),
  originalMerchantName: 'CAFE B',
  merchantName: 'CAFE B',
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

const bt = (over: Partial<ParsedBankTransaction> = {}): ParsedBankTransaction => ({
  date: new Date(2030, 0, 5),
  originalDescription: 'SHOP A',
  description: 'SHOP A',
  debit: 5,
  credit: 0,
  balance: 100,
  note: '',
  sourceFile: 'bank-test.xls',
  ...over,
})

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
  ('acct_test_max2', 'CREDIT_CARD', 'max', 'Second test card', 1900000000000),
  ('acct_test_bank2', 'BANK', 'otherbank', 'Other test bank', 1900000000000);
INSERT INTO "TransactionAlias" ("id","provider","originalName","displayName") VALUES
  ('a1', 'max', 'CAFE B', 'Cafe B'),
  ('a2', 'leumi', 'SHOP A', 'Shop A');
`)
  usePrismaOn(db)
  bank = await import('../bank')
  cards = await import('../cards')
  upload = await import('../upload')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('credit card transactions', () => {
  it('attach the account and apply its provider rules', async () => {
    expect(await cards.upsertCCTransactions([cc()], 'max-a.xlsx', 'acct_max')).toEqual({ created: 1, skipped: 0 })
    expect(await cards.upsertCCTransactions([cc()], 'max-b.xlsx', 'acct_test_max2')).toEqual({ created: 1, skipped: 0 })
    expect(db.query(`SELECT accountId, merchantName FROM "CreditCardTransaction" ORDER BY accountId`)).toEqual([
      { accountId: 'acct_max', merchantName: 'Cafe B' },
      { accountId: 'acct_test_max2', merchantName: 'Cafe B' },
    ])
  })

  it('dedupe across files within one account only', async () => {
    expect(await cards.upsertCCTransactions([cc()], 'max-c.xlsx', 'acct_max')).toEqual({ created: 0, skipped: 1 })
  })

  it('are read per account, per list of accounts, or across all cards', async () => {
    expect((await cards.getCCTransactions({ accountId: 'acct_max', year: 2030 })).length).toBe(1)
    expect((await cards.getCCTransactions({ accountId: ['acct_max', 'acct_test_max2'], year: 2030 })).length).toBe(2)
    expect((await cards.getCCTransactions({ year: 2030 })).length).toBe(2)
    expect((await cards.getCCTransactions({ accountId: [], year: 2030 })).length).toBe(0)
    expect(await cards.getCCMonthlySummary('acct_test_max2', 2030)).toMatchObject({ 1: 10, 2: 0 })
    expect(await cards.getCCCategoryStats(undefined, 2030)).toEqual({ Food: { total: 20, count: 2 } })
  })
})

describe('bank transactions', () => {
  it('attach the account, apply its provider rules and dedupe per account', async () => {
    expect(await bank.upsertBankTransactions([bt()], 'acct_leumi')).toEqual({ created: 1, skipped: 0 })
    expect(await bank.upsertBankTransactions([bt()], 'acct_leumi')).toEqual({ created: 0, skipped: 1 })
    expect(await bank.upsertBankTransactions([bt()], 'acct_test_bank2')).toEqual({ created: 1, skipped: 0 })
    expect(db.query(`SELECT accountId, description FROM "BankTransaction" ORDER BY accountId`)).toEqual([
      { accountId: 'acct_leumi', description: 'Shop A' },
      { accountId: 'acct_test_bank2', description: 'SHOP A' },
    ])
  })

  it('are read per account or across all bank accounts', async () => {
    expect((await bank.getBankTransactions({ accountId: 'acct_leumi', year: 2030 })).length).toBe(1)
    expect((await bank.getBankTransactions({ year: 2030 })).length).toBe(2)
    expect((await bank.getBankMonthlySummary(2030, 'acct_test_bank2'))[1]).toEqual({ income: 0, expense: 5 })
    expect((await bank.getBankMonthlySummary(2030))[1]).toEqual({ income: 0, expense: 10 })
  })
})

describe('uploads', () => {
  it('maps an upload source to the account kind and provider', () => {
    expect(upload.uploadTarget('BANK')).toEqual({ kind: 'BANK', provider: 'leumi' })
    expect(upload.uploadTarget('MAX')).toEqual({ kind: 'CREDIT_CARD', provider: 'max' })
    expect(upload.uploadTarget('OTHER')).toBeNull()
  })

  it('record the account and delete only that account’s rows', async () => {
    const u = await upload.recordUpload({ fileName: 'max-b.xlsx', recordCount: 1, accountId: 'acct_test_max2' })
    expect(await upload.hasUpload('acct_test_max2', 'max-b.xlsx')).toBe(true)
    expect(await upload.hasUpload('acct_max', 'max-b.xlsx')).toBe(false)

    const history = await upload.getUploadHistory()
    expect(history[0]).toMatchObject({ id: u.id, account: { id: 'acct_test_max2', kind: 'CREDIT_CARD', provider: 'max' } })

    await upload.deleteUpload(u.id)
    expect(db.query(`SELECT accountId FROM "CreditCardTransaction" ORDER BY accountId`)).toEqual([
      { accountId: 'acct_max' },
    ])
  })
})
