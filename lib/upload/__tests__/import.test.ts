import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { leumiHtml, maxXlsx, OTHER_CSV, TEST_ACCOUNTS_SQL } from './fixtures'

let db: TestDb
let mod: typeof import('../import')
let accounts: typeof import('@/lib/db/accounts')

beforeAll(async () => {
  db = createTestDb()
  db.exec(TEST_ACCOUNTS_SQL)
  usePrismaOn(db)
  mod = await import('../import')
  accounts = await import('@/lib/db/accounts')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const acct = async (id: string) => (await accounts.getAccount(id))!

describe('isImportSupported', () => {
  it('knows leumi bank and max card, nothing else', () => {
    expect(mod.isImportSupported({ kind: 'BANK', provider: 'leumi' })).toBe(true)
    expect(mod.isImportSupported({ kind: 'CREDIT_CARD', provider: 'max' })).toBe(true)
    expect(mod.isImportSupported({ kind: 'BANK', provider: 'otherbank' })).toBe(false)
    // provider/kind mismatch is not importable
    expect(mod.isImportSupported({ kind: 'CREDIT_CARD', provider: 'leumi' })).toBe(false)
  })
})

describe('importUpload', () => {
  it('imports a Leumi file into the chosen account and records the upload there', async () => {
    const res = await mod.importUpload(await acct('acct_leumi'), leumiHtml(), 'bank-fake.xls')
    expect(res).toEqual({ ok: true, created: 2, skipped: 0 })
    expect(db.query(`SELECT DISTINCT accountId FROM "BankTransaction"`)).toEqual([{ accountId: 'acct_leumi' }])
    expect(db.query(`SELECT accountId, recordCount FROM "UploadHistory"`)).toEqual([
      { accountId: 'acct_leumi', recordCount: 2 },
    ])
  })

  it('importing the same Leumi file again adds no rows', async () => {
    const res = await mod.importUpload(await acct('acct_leumi'), leumiHtml(), 'bank-fake.xls')
    expect(res).toMatchObject({ ok: true, created: 0, skipped: 2 })
    expect(db.query(`SELECT COUNT(*) AS n FROM "BankTransaction"`)).toEqual([{ n: 2 }])
  })

  it('imports a MAX file into the chosen card and reports new categories', async () => {
    const res = await mod.importUpload(await acct('acct_max'), maxXlsx('קטגוריה חדשה בדויה'), 'card-fake.xlsx')
    expect(res).toEqual({ ok: true, created: 1, skipped: 0, newCategories: ['קטגוריה חדשה בדויה'] })
    expect(db.query(`SELECT accountId FROM "CreditCardTransaction"`)).toEqual([{ accountId: 'acct_max' }])
  })

  it('rejects the same MAX file name again for the same card only', async () => {
    const again = await mod.importUpload(await acct('acct_max'), maxXlsx(), 'card-fake.xlsx')
    expect(again).toMatchObject({ ok: false, code: 'DUPLICATE_FILE', status: 409 })

    const otherCard = await mod.importUpload(await acct('acct_test_max2'), maxXlsx(), 'card-fake.xlsx')
    expect(otherCard).toMatchObject({ ok: true, created: 1 })
  })

  it('refuses providers without a parser', async () => {
    const res = await mod.importUpload(await acct('acct_test_other'), OTHER_CSV, 'other.csv')
    expect(res).toMatchObject({ ok: false, code: 'UNSUPPORTED_PROVIDER', status: 422 })
  })

  it('reports a parse error when the file has no transactions for that parser', async () => {
    const res = await mod.importUpload(await acct('acct_leumi'), OTHER_CSV, 'other.csv')
    expect(res).toMatchObject({ ok: false, code: 'PARSE_ERROR', status: 422 })
    const card = await mod.importUpload(await acct('acct_max'), OTHER_CSV, 'other.csv')
    expect(card).toMatchObject({ ok: false, code: 'PARSE_ERROR', status: 422 })
  })
})
