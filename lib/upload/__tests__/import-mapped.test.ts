import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { TEST_ACCOUNTS_SQL } from './fixtures'
import { bankSignedCsv, calXlsx, sheetOf } from '@/lib/import/__tests__/fixtures'
import { headerSignature, suggestMapping } from '@/lib/import/mapping'
import { readRawGrid } from '@/lib/parsers/raw-grid'

// All values are made up.

let db: TestDb
let mod: typeof import('../import')
let accounts: typeof import('@/lib/db/accounts')
let profiles: typeof import('@/lib/db/import-profiles')
let mapper: typeof import('../mapper-preview')

const EXTRA_ACCOUNTS = `
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
  ('acct_test_cal', 'CREDIT_CARD', 'cal', 'כרטיס כאל בדוי', 1900000000000),
  ('acct_test_cal2', 'CREDIT_CARD', 'cal', 'כרטיס כאל שני', 1900000000001),
  ('acct_test_isra', 'CREDIT_CARD', 'isracard', 'כרטיס אחר בדוי', 1900000000002);
`

beforeAll(async () => {
  db = createTestDb()
  db.exec(TEST_ACCOUNTS_SQL + EXTRA_ACCOUNTS)
  usePrismaOn(db)
  mod = await import('../import')
  accounts = await import('@/lib/db/accounts')
  profiles = await import('@/lib/db/import-profiles')
  mapper = await import('../mapper-preview')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const acct = async (id: string) => (await accounts.getAccount(id))!
const calSheet = () => sheetOf(calXlsx())
const calMapping = () => suggestMapping(calSheet(), 'card')
const local = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

describe('importUpload with a mapping', () => {
  it('imports a Cal-shaped file with the billing date from the metadata line', async () => {
    const res = await mod.importUpload(await acct('acct_test_cal'), calXlsx(), 'cal-fake.xlsx', { mapping: calMapping() })
    expect(res).toMatchObject({ ok: true, created: 3, skipped: 0, skippedRows: [] })
    const rows = db.query<{ billingDate: number; sourceFile: string }>(
      `SELECT billingDate, sourceFile FROM "CreditCardTransaction" WHERE accountId = 'acct_test_cal'`
    )
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map(r => local(r.billingDate)))).toEqual(new Set(['2030-2-10']))
    expect(db.query(`SELECT recordCount FROM "UploadHistory" WHERE accountId = 'acct_test_cal'`)).toEqual([{ recordCount: 3 }])
  })

  it('a re-upload adds nothing and lists every row as skipped; force imports one anyway', async () => {
    const again = await mod.importUpload(await acct('acct_test_cal'), calXlsx(), 'cal-fake-2.xlsx', { mapping: calMapping() })
    expect(again).toMatchObject({ ok: true, created: 0, skipped: 3 })
    if (!again.ok) throw new Error()
    expect(again.skippedRows.map(r => r.matchedFile)).toEqual(['cal-fake.xlsx', 'cal-fake.xlsx', 'cal-fake.xlsx'])
    expect(again.skippedRows[0]).toMatchObject({ billingDate: '2030-02-10' })
    const forced = await mod.importUpload(await acct('acct_test_cal'), calXlsx(), 'cal-fake-2.xlsx', {
      mapping: calMapping(),
      force: [0],
    })
    expect(forced).toMatchObject({ ok: true, created: 1, skipped: 2 })
  })

  it('imports a bank file with a signed amount', async () => {
    const m = suggestMapping(sheetOf(bankSignedCsv(), 'b.csv'), 'bank')
    const res = await mod.importUpload(await acct('acct_test_other'), bankSignedCsv(), 'bank-fake.csv', { mapping: m })
    expect(res).toMatchObject({ ok: true, created: 2 })
    expect(db.query(`SELECT debit, credit FROM "BankTransaction" WHERE accountId = 'acct_test_other' ORDER BY date`)).toEqual([
      { debit: 0, credit: 5317.43 },
      { debit: 127.83, credit: 0 },
    ])
  })

  it('refuses a malformed mapping or one without the required fields', async () => {
    const a = await acct('acct_test_cal')
    for (const mapping of [null, 'x', { ...calMapping(), headerRow: -2 }, { ...calMapping(), columns: { merchant: 1 } }]) {
      expect(await mod.importUpload(a, calXlsx(), 'x.xlsx', { mapping })).toMatchObject({ ok: false, code: 'INVALID_MAPPING', status: 400 })
    }
    // a card mapping is not a bank mapping
    expect(await mod.importUpload(await acct('acct_test_other'), calXlsx(), 'x.xlsx', { mapping: calMapping() })).toMatchObject({
      ok: false,
      code: 'INVALID_MAPPING',
    })
  })

  it('refuses a file with row errors, naming the row', async () => {
    const bad = calXlsx([[new Date(2030, 0, 3), 'מאפייה בדויה', 1, 'לא מספר', 'רגילה', null, null]])
    const res = await mod.importUpload(await acct('acct_test_cal'), bad, 'bad.xlsx', { mapping: calMapping() })
    expect(res).toMatchObject({ ok: false, code: 'PARSE_ERROR' })
    if (res.ok) throw new Error()
    expect(res.error).toContain('שורה 5')
  })

  it('refuses a file sent without a mapping', async () => {
    expect(await mod.importUpload(await acct('acct_test_cal'), calXlsx(), 'x.xlsx')).toMatchObject({
      ok: false,
      code: 'INVALID_MAPPING',
    })
  })
})

describe('import profiles', () => {
  let profileId: string

  it('validates what it stores', async () => {
    const a = await acct('acct_test_cal')
    const sig = headerSignature(calSheet(), 3)
    await expect(profiles.createImportProfile(a, { name: ' ', mapping: calMapping(), headerSignature: sig })).rejects.toThrow(
      profiles.ProfileValidationError
    )
    await expect(
      profiles.createImportProfile(a, { name: 'x', mapping: { ...calMapping(), columns: {} }, headerSignature: sig })
    ).rejects.toThrow(profiles.ProfileValidationError)
    await expect(profiles.createImportProfile(a, { name: 'x', mapping: calMapping(), headerSignature: 7 })).rejects.toThrow(
      profiles.ProfileValidationError
    )
  })

  it('is created from an account, with kind and provider taken from it', async () => {
    const p = await profiles.createImportProfile(await acct('acct_test_cal'), {
      name: '  כאל –  פירוט עסקאות ',
      mapping: { ...calMapping(), junk: 1 },
      headerSignature: headerSignature(calSheet(), 3),
      linkAccount: true,
    })
    profileId = p.id
    expect(p).toMatchObject({ name: 'כאל – פירוט עסקאות', accountKind: 'CREDIT_CARD', provider: 'cal', accountId: 'acct_test_cal' })
    expect(JSON.parse(p.mapping)).toEqual(calMapping())
  })

  it('matches a file with the same header signature, for any account of the provider', async () => {
    const wb = readRawGrid(calXlsx([[new Date(2030, 2, 1), 'עסק בדוי אחר', 5, 5, 'רגילה', null, null]]), 'x.xlsx')
    expect((await profiles.findMatchingProfile(await acct('acct_test_cal'), wb))?.profile.id).toBe(profileId)
    expect((await profiles.findMatchingProfile(await acct('acct_test_cal2'), wb))?.profile.id).toBe(profileId)
    expect(await profiles.findMatchingProfile(await acct('acct_test_isra'), wb)).toBeNull()
    expect(await profiles.findMatchingProfile(await acct('acct_test_cal'), readRawGrid(bankSignedCsv(), 'b.csv'))).toBeNull()
  })

  it('feeds the upload preview', async () => {
    const info = await mapper.mapperFor(await acct('acct_test_cal'), readRawGrid(calXlsx(), 'x.xlsx'))
    expect(info).toMatchObject({ kind: 'card', profile: { id: profileId, linked: true }, signature: headerSignature(calSheet(), 3) })
    const fresh = await mapper.mapperFor(await acct('acct_test_isra'), readRawGrid(calXlsx(), 'x.xlsx'))
    expect(fresh).toMatchObject({ kind: 'card', profile: null })
    expect(fresh?.suggestion).toEqual(calMapping())
  })

  it('imports by profileId, only into an account it fits', async () => {
    const res = await mod.importUpload(await acct('acct_test_cal2'), calXlsx(), 'cal-fake.xlsx', { profileId })
    expect(res).toMatchObject({ ok: true, created: 3 })
    expect(await mod.importUpload(await acct('acct_test_isra'), calXlsx(), 'x.xlsx', { profileId })).toMatchObject({
      ok: false,
      code: 'PROFILE_NOT_FOUND',
    })
    expect(await mod.importUpload(await acct('acct_test_cal'), calXlsx(), 'x.xlsx', { profileId: 'nope' })).toMatchObject({
      ok: false,
      code: 'PROFILE_NOT_FOUND',
    })
  })

  it('never uses a stored mapping that no longer validates', async () => {
    db.exec(`UPDATE "ImportProfile" SET mapping = '{"headerRow":"x"}' WHERE id = '${profileId}'`)
    expect(await mod.importUpload(await acct('acct_test_cal'), calXlsx(), 'x.xlsx', { profileId })).toMatchObject({
      ok: false,
      code: 'INVALID_MAPPING',
    })
    expect(await profiles.findMatchingProfile(await acct('acct_test_cal'), readRawGrid(calXlsx(), 'x.xlsx'))).toBeNull()
    await profiles.updateImportProfile(profileId, { mapping: calMapping(), headerSignature: headerSignature(calSheet(), 3) })
  })

  it('renames, keeps one default per account, and deletes', async () => {
    expect((await profiles.updateImportProfile(profileId, { name: 'שם חדש' }))?.name).toBe('שם חדש')
    expect(await profiles.updateImportProfile('nope', { name: 'x' })).toBeNull()
    const second = await profiles.createImportProfile(await acct('acct_test_cal'), {
      name: 'עוד מיפוי',
      mapping: calMapping(),
      headerSignature: 'a|b|c',
      linkAccount: true,
    })
    expect((await profiles.getImportProfile(profileId))?.accountId).toBeNull()
    expect(await profiles.deleteImportProfile(second.id)).toBe(true)
    expect(await profiles.deleteImportProfile(second.id)).toBe(false)
  })

  it('loses its account link, not itself, when the account is deleted', async () => {
    await profiles.createImportProfile(await acct('acct_test_isra'), {
      name: 'מיפוי לחשבון שיימחק',
      mapping: calMapping(),
      headerSignature: 'a|b|c',
      linkAccount: true,
    })
    expect(await accounts.deleteAccount('acct_test_isra')).toMatchObject({ status: 'deleted' })
    expect(db.query(`SELECT accountId FROM "ImportProfile" WHERE name = 'מיפוי לחשבון שיימחק'`)).toEqual([{ accountId: null }])
  })
})

describe('migration 20261014040000_import_profiles', () => {
  it('is reversed by down.sql', () => {
    const t = createTestDb({ before: '20261014040000_import_profiles' })
    try {
      const schema = () => t.query(`SELECT name, sql FROM sqlite_master ORDER BY name`)
      const before = schema()
      t.applyMigration('20261014040000_import_profiles')
      expect(schema()).not.toEqual(before)
      t.applyDown('20261014040000_import_profiles')
      expect(schema()).toEqual(before)
      expect(t.query(`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name LIKE '%import_profiles'`)).toEqual([])
    } finally {
      t.cleanup()
    }
  })
})
