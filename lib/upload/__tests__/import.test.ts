import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { leumiHtml, maxXlsx, maxXlsxWithPending, OTHER_CSV, TEST_ACCOUNTS_SQL } from './fixtures'
import { readRawGrid } from '@/lib/parsers/raw-grid'
import { findHeaderRow, suggestMapping, type MappingKind } from '@/lib/import/mapping'

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

/** The mapping the upload page sends for a file: the mapper's suggestion (every import is mapped) */
function mappingFor(buf: Buffer, fileName: string, kind: MappingKind) {
  const wb = readRawGrid(buf, fileName)
  const found = wb.sheets.findIndex(s => findHeaderRow(s, kind) !== -1)
  const index = found === -1 ? 0 : found
  return { mapping: suggestMapping(wb.sheets[index], kind, index) }
}
const bank = (buf: Buffer, name: string) => mappingFor(buf, name, 'bank')
const card = (buf: Buffer, name: string, extra: object = {}) => ({ ...mappingFor(buf, name, 'card'), ...extra })

describe('isImportSupported', () => {
  it('is every bank and card account, whatever the provider', () => {
    expect(mod.isImportSupported({ kind: 'BANK' })).toBe(true)
    expect(mod.isImportSupported({ kind: 'CREDIT_CARD' })).toBe(true)
    expect(mod.isImportSupported({ kind: 'TRADING' })).toBe(false)
    expect(mod.isImportSupported({ kind: 'PENSION' })).toBe(false)
  })
})

describe('importUpload', () => {
  it('imports a Leumi file into the chosen account and records the upload there', async () => {
    const res = await mod.importUpload(await acct('acct_leumi'), leumiHtml(), 'bank-fake.xls', bank(leumiHtml(), 'bank-fake.xls'))
    expect(res).toEqual({ ok: true, created: 2, skipped: 0, skippedRows: [] })
    expect(db.query(`SELECT DISTINCT accountId FROM "BankTransaction"`)).toEqual([{ accountId: 'acct_leumi' }])
    expect(db.query(`SELECT accountId, recordCount FROM "UploadHistory"`)).toEqual([
      { accountId: 'acct_leumi', recordCount: 2 },
    ])
  })

  it('importing the same Leumi file again adds no rows', async () => {
    const res = await mod.importUpload(await acct('acct_leumi'), leumiHtml(), 'bank-fake.xls', bank(leumiHtml(), 'bank-fake.xls'))
    expect(res).toMatchObject({ ok: true, created: 0, skipped: 2 })
    expect(db.query(`SELECT COUNT(*) AS n FROM "BankTransaction"`)).toEqual([{ n: 2 }])
  })

  it('imports a MAX file into the chosen card and reports new categories', async () => {
    const res = await mod.importUpload(await acct('acct_max'), maxXlsx('קטגוריה חדשה בדויה'), 'card-fake.xlsx', card(maxXlsx(), 'card-fake.xlsx'))
    expect(res).toEqual({ ok: true, created: 1, skipped: 0, skippedRows: [], newCategories: ['קטגוריה חדשה בדויה'] })
    expect(db.query(`SELECT accountId FROM "CreditCardTransaction"`)).toEqual([{ accountId: 'acct_max' }])
  })

  it('re-uploading the same MAX file adds nothing, lists the skipped rows and keeps one history entry', async () => {
    const again = await mod.importUpload(await acct('acct_max'), maxXlsx(), 'card-fake.xlsx', card(maxXlsx(), 'card-fake.xlsx'))
    expect(again).toMatchObject({ ok: true, created: 0, skipped: 1 })
    expect(again.ok && again.skippedRows).toHaveLength(1)
    expect(db.query(`SELECT COUNT(*) AS n FROM "CreditCardTransaction" WHERE accountId = 'acct_max'`)).toEqual([{ n: 1 }])
    expect(db.query(`SELECT recordCount FROM "UploadHistory" WHERE accountId = 'acct_max'`)).toEqual([{ recordCount: 1 }])

    const otherCard = await mod.importUpload(await acct('acct_test_max2'), maxXlsx(), 'card-fake.xlsx', card(maxXlsx(), 'card-fake.xlsx'))
    expect(otherCard).toMatchObject({ ok: true, created: 1 })
  })

  it('a renamed copy that adds nothing leaves no extra history entry', async () => {
    const copy = await mod.importUpload(await acct('acct_max'), maxXlsx(), 'card-fake (1).xlsx', card(maxXlsx(), 'card-fake (1).xlsx'))
    expect(copy).toMatchObject({ ok: true, created: 0, skipped: 1 })
    expect(db.query(`SELECT fileName FROM "UploadHistory" WHERE accountId = 'acct_max'`)).toEqual([
      { fileName: 'card-fake.xlsx' },
    ])
  })

  it('imports skipped rows the user chose to keep', async () => {
    const forced = await mod.importUpload(await acct('acct_max'), maxXlsx(), 'card-fake.xlsx', card(maxXlsx(), 'card-fake.xlsx', { force: [0] }))
    expect(forced).toMatchObject({ ok: true, created: 1, skipped: 0 })
    expect(db.query(`SELECT recordCount FROM "UploadHistory" WHERE accountId = 'acct_max'`)).toEqual([{ recordCount: 2 }])
  })

  it('refuses a file sent without a mapping', async () => {
    const res = await mod.importUpload(await acct('acct_leumi'), leumiHtml(), 'bank-fake.xls')
    expect(res).toMatchObject({ ok: false, code: 'INVALID_MAPPING', status: 400 })
  })

  it('imports any provider the same way', async () => {
    const res = await mod.importUpload(await acct('acct_test_other'), OTHER_CSV, 'other.csv', bank(OTHER_CSV, 'other.csv'))
    expect(res).toMatchObject({ ok: true, created: 1 })
  })

  it('imports the billed rows of a MAX file and only reports the ones not billed yet', async () => {
    const res = await mod.importUpload(await acct('acct_test_max2'), maxXlsxWithPending(), 'pending-fake.xlsx', card(maxXlsxWithPending(), 'pending-fake.xlsx'))
    expect(res).toMatchObject({ ok: true, created: 1, pending: 2 })
    expect(db.query(`SELECT originalMerchantName AS m FROM "CreditCardTransaction" WHERE sourceFile = 'pending-fake.xlsx'`)).toEqual([
      { m: 'עסק בדוי אחר' },
    ])
  })

  it('reports a parse error when the file does not fit the mapping', async () => {
    const res = await mod.importUpload(await acct('acct_leumi'), OTHER_CSV, 'other.csv', bank(leumiHtml(), 'bank-fake.xls'))
    expect(res).toMatchObject({ ok: false, code: 'PARSE_ERROR', status: 422 })
    const wrong = await mod.importUpload(await acct('acct_max'), OTHER_CSV, 'other.csv', card(maxXlsx(), 'card-fake.xlsx'))
    expect(wrong).toMatchObject({ ok: false, code: 'PARSE_ERROR', status: 422 })
  })
})

describe('importUpload with category mappings (ENG-75)', () => {
  it("doesn't offer an issuer category that is already mapped for the provider", async () => {
    db.exec(`INSERT INTO "CategoryMapping" ("id","provider","sourceCategory","category") VALUES ('cm_test','max','קטגוריה ממופה בדויה','קטגוריה שלי בדויה')`)
    const file = maxXlsx('קטגוריה ממופה בדויה')
    const res = await mod.importUpload(await acct('acct_max'), file, 'card-mapped-fake.xlsx', card(file, 'card-mapped-fake.xlsx'))
    expect(res.ok && res.newCategories).toEqual([])
  })
})
