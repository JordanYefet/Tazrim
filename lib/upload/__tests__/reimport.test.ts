import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { bankSignedCsv, calXlsx, sheetOf } from '@/lib/import/__tests__/fixtures'
import { headerSignature, suggestMapping, type ImportMapping } from '@/lib/import/mapping'
import { readRawGrid } from '@/lib/parsers/raw-grid'

// ENG-65: re-mapping a file and re-importing it, replacing its earlier rows.
// All values are made up.

let db: TestDb
let mod: typeof import('../import')
let accounts: typeof import('@/lib/db/accounts')
let profiles: typeof import('@/lib/db/import-profiles')
let mapper: typeof import('../mapper-preview')
let route: typeof import('@/app/api/upload/reimport/route')

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
    ('acct_fake_cal', 'CREDIT_CARD', 'cal', 'כרטיס כאל בדוי', 1900000000000),
    ('acct_fake_bank', 'BANK', 'otherbank', 'בנק בדוי', 1900000000001);`)
  usePrismaOn(db)
  mod = await import('../import')
  accounts = await import('@/lib/db/accounts')
  profiles = await import('@/lib/db/import-profiles')
  mapper = await import('../mapper-preview')
  route = await import('@/app/api/upload/reimport/route')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const acct = async (id: string) => (await accounts.getAccount(id))!
const calRight = () => suggestMapping(sheetOf(calXlsx()), 'card')
/** The user's mistake: purchase amount and charged amount swapped */
const calWrong = (): ImportMapping => {
  const m = calRight()
  return { ...m, columns: { ...m.columns, chargedAmount: m.columns.originalAmount, originalAmount: m.columns.chargedAmount } }
}
const cardRows = (file: string) =>
  db.query<{ chargedAmount: number }>(
    `SELECT chargedAmount FROM "CreditCardTransaction" WHERE accountId = 'acct_fake_cal' AND sourceFile = '${file}' ORDER BY chargedAmount`
  )

describe('reimportUpload, card account', () => {
  it('replaces the rows of the same file with the corrected mapping, in one go', async () => {
    const a = await acct('acct_fake_cal')
    expect(await mod.importUpload(a, calXlsx(), 'cal-fake.xlsx', { mapping: calWrong() })).toMatchObject({ ok: true, created: 3 })
    // Another file of the account stays as it is
    const other = calXlsx([[new Date(2030, 1, 2), 'קיוסק בדוי', 12.5, 12.5, 'רגילה', null, null]])
    expect(await mod.importUpload(a, other, 'cal-other.xlsx', { mapping: calRight() })).toMatchObject({ ok: true, created: 1 })
    expect(cardRows('cal-fake.xlsx').map(r => r.chargedAmount)).toEqual([17.63, 43.91, 1173.18])

    const dry = await mod.reimportUpload(a, calXlsx(), 'cal-fake.xlsx', { mapping: calRight(), dryRun: true })
    expect(dry).toEqual({ ok: true, dryRun: true, existing: 3, incoming: 3 })
    expect(cardRows('cal-fake.xlsx')).toHaveLength(3)

    const res = await mod.reimportUpload(a, calXlsx(), 'cal-fake.xlsx', { mapping: calRight() })
    expect(res).toMatchObject({ ok: true, dryRun: false, replaced: 3, created: 3, skipped: 0 })
    expect(cardRows('cal-fake.xlsx').map(r => r.chargedAmount)).toEqual([17.63, 43.91, 391.06])
    expect(cardRows('cal-other.xlsx')).toEqual([{ chargedAmount: 12.5 }])
    // The file's upload record now counts the new rows only
    expect(db.query(`SELECT fileName, recordCount FROM "UploadHistory" WHERE accountId = 'acct_fake_cal' ORDER BY fileName`)).toEqual([
      { fileName: 'cal-fake.xlsx', recordCount: 3 },
      { fileName: 'cal-other.xlsx', recordCount: 1 },
    ])
  })

  it('changes nothing when the file does not read with the mapping', async () => {
    const broken = { ...calRight(), sheet: 3 }
    const res = await mod.reimportUpload(await acct('acct_fake_cal'), calXlsx(), 'cal-fake.xlsx', { mapping: broken })
    expect(res.ok).toBe(false)
    expect(cardRows('cal-fake.xlsx')).toHaveLength(3)
  })

  it('a file never imported before is simply imported', async () => {
    const res = await mod.reimportUpload(
      await acct('acct_fake_cal'),
      calXlsx([[new Date(2030, 2, 4), 'חנות חדשה בדויה', 8, 8, 'רגילה', null, null]]),
      'cal-new.xlsx',
      { mapping: calRight() }
    )
    expect(res).toMatchObject({ ok: true, replaced: 0, created: 1 })
  })
})

describe('reimportUpload, bank account', () => {
  const bankRight = () => suggestMapping(sheetOf(bankSignedCsv(), 'bank.csv'), 'bank')
  const bankRows = () =>
    db.query<{ debit: number; credit: number }>(
      `SELECT debit, credit FROM "BankTransaction" WHERE accountId = 'acct_fake_bank' AND sourceFile = 'bank-fake.csv' ORDER BY debit, credit`
    )

  it('replaces BankTransaction rows from the same sourceFile', async () => {
    const a = await acct('acct_fake_bank')
    // The mistake: signs read the wrong way round
    const wrong = { ...bankRight(), expensesNegative: !bankRight().expensesNegative }
    expect(await mod.importUpload(a, bankSignedCsv(), 'bank-fake.csv', { mapping: wrong })).toMatchObject({ ok: true, created: 2 })
    expect(bankRows()).toEqual([{ debit: 0, credit: 127.83 }, { debit: 5317.43, credit: 0 }])

    expect(await mod.reimportUpload(a, bankSignedCsv(), 'bank-fake.csv', { mapping: bankRight(), dryRun: true })).toEqual({
      ok: true,
      dryRun: true,
      existing: 2,
      incoming: 2,
    })
    expect(await mod.reimportUpload(a, bankSignedCsv(), 'bank-fake.csv', { mapping: bankRight() })).toMatchObject({
      ok: true,
      replaced: 2,
      created: 2,
    })
    expect(bankRows()).toEqual([{ debit: 0, credit: 5317.43 }, { debit: 127.83, credit: 0 }])
    expect(db.query(`SELECT recordCount FROM "UploadHistory" WHERE accountId = 'acct_fake_bank'`)).toEqual([{ recordCount: 2 }])
  })
})

describe('POST /api/upload/reimport', () => {
  const post = (fields: Record<string, string | Blob>, dryRun = false) => {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    return route.POST(new Request(`http://localhost/api/upload/reimport${dryRun ? '?dryRun=1' : ''}`, { method: 'POST', body: form }))
  }
  const file = () => new File([new Uint8Array(calXlsx())], 'cal-fake.xlsx')

  it('counts with dryRun, then replaces', async () => {
    const dry = await post({ file: file(), accountId: 'acct_fake_cal', mapping: JSON.stringify(calRight()) }, true)
    expect(await dry.json()).toEqual({ dryRun: true, existing: 3, incoming: 3 })
    const res = await post({ file: file(), accountId: 'acct_fake_cal', mapping: JSON.stringify(calRight()) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ dryRun: false, replaced: 3, created: 3 })
  })

  it('400 for a bad mapping, 404 for an unknown account', async () => {
    expect((await post({ file: file(), accountId: 'acct_fake_cal', mapping: '{"nope":1}' })).status).toBe(400)
    expect((await post({ file: file(), accountId: 'acct_nope', mapping: JSON.stringify(calRight()) })).status).toBe(404)
  })
})

describe('mapperFor: the account profile re-mapping starts from', () => {
  it('is returned even when the file does not match its header signature', async () => {
    const a = await acct('acct_fake_cal')
    const saved = await profiles.createImportProfile(a, {
      name: 'מיפוי בדוי',
      mapping: { ...calRight(), headerRow: 2 },
      headerSignature: 'a signature no file has',
      linkAccount: true,
    })
    const info = await mapper.mapperFor(a, readRawGrid(calXlsx(), 'x.xlsx'))
    expect(info?.profile).toBeNull()
    expect(info?.accountProfile).toMatchObject({ id: saved.id, name: 'מיפוי בדוי', mapping: { headerRow: 2 } })
    // A matching file still finds it as its profile
    await profiles.updateImportProfile(saved.id, {
      mapping: calRight(),
      headerSignature: headerSignature(sheetOf(calXlsx()), calRight().headerRow),
    })
    const again = await mapper.mapperFor(a, readRawGrid(calXlsx(), 'x.xlsx'))
    expect(again?.profile).toMatchObject({ id: saved.id, linked: true })
  })
})
