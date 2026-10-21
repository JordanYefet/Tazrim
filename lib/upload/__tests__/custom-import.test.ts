import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { leumiHtml, maxXlsx, maxXlsxWithPending, TEST_ACCOUNTS_SQL } from './fixtures'
import { bankSignedCsv, sheetOf } from '@/lib/import/__tests__/fixtures'
import { headerSignature, suggestMapping } from '@/lib/import/mapping'
import { buildSnapshot } from '@/lib/import/snapshot'
import { BUILT_IN_LAYOUTS, layoutSignature } from '@/lib/import/builtin-layouts'

// ENG-69: header storage, file-less edits, and Leumi / Max through a custom mapping.
// Every value is made up; dates are in 2030.

let db: TestDb
let mod: typeof import('../import')
let accounts: typeof import('@/lib/db/accounts')
let profilesRoute: typeof import('@/app/api/import-profiles/route')
let profileRoute: typeof import('@/app/api/import-profiles/[id]/route')
let modeRoute: typeof import('@/app/api/accounts/[id]/import-mode/route')
let previewRoute: typeof import('@/app/api/upload/preview/route')

beforeAll(async () => {
  db = createTestDb()
  db.exec(TEST_ACCOUNTS_SQL)
  usePrismaOn(db)
  mod = await import('../import')
  accounts = await import('@/lib/db/accounts')
  profilesRoute = await import('@/app/api/import-profiles/route')
  profileRoute = await import('@/app/api/import-profiles/[id]/route')
  modeRoute = await import('@/app/api/accounts/[id]/import-mode/route')
  previewRoute = await import('@/app/api/upload/preview/route')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const acct = async (id: string) => (await accounts.getAccount(id))!
const json = (method: string, body: unknown) =>
  new Request('http://localhost/api/x', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const get = () => new Request('http://localhost/api/x')
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const setMode = (id: string, mode: string) => modeRoute.POST(json('POST', { mode }), ctx(id))
const preview = (buf: Buffer, name: string, accountId: string) => {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(buf)], name))
  form.append('accountId', accountId)
  return previewRoute.POST(new Request('http://localhost/api/upload/preview', { method: 'POST', body: form }))
}

/** Leumi's HTML export with one more table on top, so the header is a row lower than the layout's. */
function leumiHtmlWithBalance(): Buffer {
  const html = leumiHtml([
    ['05/03/2030', 'חנות בדויה', '12.00', '0.00'],
    ['06/03/2030', 'הפקדה בדויה', '0.00', '30.00'],
    ['07/03/2030', 'שורת מידע בדויה', '', ''],
  ]).toString('utf8')
  return Buffer.from(html.replace('<body>', '<body><table><tr><td>היתרה ₪100.00</td><td>מסגרת 0.00</td></tr></table>'))
}

describe('header rows stored with a mapping', () => {
  const sheet = sheetOf(bankSignedCsv(), 'b.csv')
  const mapping = suggestMapping(sheet, 'bank')
  const signature = headerSignature(sheet, mapping.headerRow)
  let id: string

  it('saves the snapshot sent with a new profile and returns it for the file-less mapper', async () => {
    const headers = buildSnapshot(sheet, mapping, 'bank')
    const res = await profilesRoute.POST(
      json('POST', { accountId: 'acct_test_other', name: 'בנק בדוי', mapping, headerSignature: signature, headers, linkAccount: true })
    )
    expect(res.status).toBe(201)
    id = (await res.json()).id
    const stored = db.query<{ headers: string }>(`SELECT headers FROM "ImportProfile" WHERE id = '${id}'`)[0]
    expect(JSON.parse(stored.headers)).toEqual(headers)

    const body = await (await profileRoute.GET(get(), ctx(id))).json()
    expect(body).toMatchObject({ id, kind: 'bank', mapping, snapshot: headers, account: { id: 'acct_test_other', customImport: false } })
    expect(body.snapshot.samples).toHaveLength(2)
  })

  it('refuses a snapshot whose header is not the signature', async () => {
    const res = await profilesRoute.POST(
      json('POST', { accountId: 'acct_test_other', name: 'x', mapping, headerSignature: signature, headers: { v: 1, header: ['אחר'], samples: [] } })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe('headers')
  })

  it('updates the mapping without a file and keeps the stored header', async () => {
    const before = db.query(`SELECT headerSignature, headers FROM "ImportProfile" WHERE id = '${id}'`)
    const next = { ...mapping, columns: { ...mapping.columns, balance: undefined }, dateFormat: 'YYYY-MM-DD' }
    const res = await profileRoute.PATCH(json('PATCH', { mapping: next }), ctx(id))
    expect(res.status).toBe(200)
    expect(db.query(`SELECT headerSignature, headers FROM "ImportProfile" WHERE id = '${id}'`)).toEqual(before)
    const body = await (await profileRoute.GET(get(), ctx(id))).json()
    expect(body.mapping.dateFormat).toBe('YYYY-MM-DD')
    expect(body.mapping.columns.balance).toBeUndefined()
    // still validated
    expect((await profileRoute.PATCH(json('PATCH', { mapping: { ...mapping, columns: {} } }), ctx(id))).status).toBe(400)
  })

  it('a mapping from a file with another header drops the old snapshot unless a new one comes', async () => {
    const res = await profileRoute.PATCH(json('PATCH', { mapping, headerSignature: 'תאריך|אחר' }), ctx(id))
    expect(res.status).toBe(200)
    expect(db.query(`SELECT headers FROM "ImportProfile" WHERE id = '${id}'`)).toEqual([{ headers: null }])
  })

  it('rebuilds the header of a profile saved before ENG-69 from its signature', async () => {
    db.exec(`UPDATE "ImportProfile" SET headers = NULL, headerSignature = '${signature}' WHERE id = '${id}'`)
    const body = await (await profileRoute.GET(get(), ctx(id))).json()
    expect(body.snapshot).toEqual({ v: 1, header: signature.split('|'), samples: [], rebuilt: true })
    expect((await profileRoute.GET(get(), ctx('nope'))).status).toBe(404)
  })

  it('drops the sample rows when the account is deleted', async () => {
    db.exec(`UPDATE "ImportProfile" SET headers = '{"v":1,"header":["תאריך"],"samples":[["2030-01-02"]]}' WHERE id = '${id}'`)
    expect(await accounts.deleteAccount('acct_test_other')).toMatchObject({ status: 'deleted' })
    const row = db.query<{ headers: string; accountId: string | null }>(`SELECT headers, accountId FROM "ImportProfile" WHERE id = '${id}'`)[0]
    expect(row.accountId).toBeNull()
    expect(JSON.parse(row.headers).samples).toEqual([])
  })
})

describe('switching Max to a custom mapping', () => {
  let profileId: string

  it('seeds a linked profile from the built-in layout', async () => {
    const res = await setMode('acct_test_max2', 'custom')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ customImport: true, profile: { name: BUILT_IN_LAYOUTS.max.name } })
    profileId = body.profile.id
    const row = db.query<{ accountId: string; headerSignature: string; mapping: string; headers: string }>(
      `SELECT accountId, headerSignature, mapping, headers FROM "ImportProfile" WHERE id = '${profileId}'`
    )[0]
    expect(row.accountId).toBe('acct_test_max2')
    expect(row.headerSignature).toBe(layoutSignature(BUILT_IN_LAYOUTS.max))
    expect(JSON.parse(row.mapping)).toEqual(BUILT_IN_LAYOUTS.max.mapping)
    expect(JSON.parse(row.headers).samples).toEqual([])
    expect(mod.isImportSupported(await acct('acct_test_max2'))).toBe(false)
    expect(mod.hasBuiltInImport(await acct('acct_test_max2'))).toBe(true)
  })

  it('no longer imports through the built-in parser without a mapping', async () => {
    const res = await mod.importUpload(await acct('acct_test_max2'), maxXlsx(), 'max-fake.xlsx')
    expect(res).toMatchObject({ ok: false, code: 'INVALID_MAPPING' })
  })

  it('the upload preview offers the mapper for it', async () => {
    const res = await preview(maxXlsxWithPending(), 'max-fake.xlsx', 'acct_test_max2')
    const body = await res.json()
    expect(body.customImport).toBe(true)
    expect(body.importSupported).toBe(true)
    expect(body.mapper.kind).toBe('card')
    // the test export has 11 of Max's 16 columns, so the seeded profile doesn't match it by header
    expect(body.mapper.accountProfile.id).toBe(profileId)
  })

  it('imports a multi-sheet export through the mapping, leaving the pending sheet out', async () => {
    // save the profile on this file's header (what the upload page does after a mapped import)
    const wb = (await import('@/lib/parsers/raw-grid')).readRawGrid(maxXlsxWithPending(), 'max-fake.xlsx')
    const mapping = BUILT_IN_LAYOUTS.max.mapping
    const headers = buildSnapshot(wb.sheets[0], mapping, 'card')
    expect(
      (await profileRoute.PATCH(json('PATCH', { mapping, headerSignature: headerSignature(wb.sheets[0], 3), headers }), ctx(profileId))).status
    ).toBe(200)

    const res = await mod.importUpload(await acct('acct_test_max2'), maxXlsxWithPending(), 'max-pending-fake.xlsx', { profileId })
    expect(res).toMatchObject({ ok: true, created: 1, skipped: 0, pending: 2 })
    const rows = db.query<{ originalMerchantName: string; chargedAmount: number }>(
      `SELECT originalMerchantName, chargedAmount FROM "CreditCardTransaction" WHERE accountId = 'acct_test_max2'`
    )
    expect(rows).toEqual([{ originalMerchantName: 'עסק בדוי אחר', chargedAmount: 22 }])

    // and the preview now recognises the file by the saved profile
    const body = await (await preview(maxXlsxWithPending(), 'max-fake.xlsx', 'acct_test_max2')).json()
    expect(body.mapper.profile).toMatchObject({ id: profileId, linked: true })
  })

  it('reads every sheet with the header for a client mapping too', async () => {
    const res = await mod.importUpload(await acct('acct_test_max2'), maxXlsxWithPending(), 'max-pending-fake-2.xlsx', {
      mapping: BUILT_IN_LAYOUTS.max.mapping,
    })
    // the billed row is already there, the pending ones still left out
    expect(res).toMatchObject({ ok: true, created: 0, skipped: 1, pending: 2 })
  })

  it('switches back to the built-in importer and keeps the profile for next time', async () => {
    const res = await setMode('acct_test_max2', 'builtin')
    expect(await res.json()).toMatchObject({ customImport: false, profile: { id: profileId } })
    expect(mod.isImportSupported(await acct('acct_test_max2'))).toBe(true)
    const imported = await mod.importUpload(await acct('acct_test_max2'), maxXlsx(), 'max-fake.xlsx')
    expect(imported).toMatchObject({ ok: true, created: 1 })
    const again = await (await setMode('acct_test_max2', 'custom')).json()
    expect(again.profile.id).toBe(profileId)
    expect(db.query(`SELECT COUNT(*) AS n FROM "ImportProfile" WHERE accountId = 'acct_test_max2'`)).toEqual([{ n: 1 }])
    await setMode('acct_test_max2', 'builtin')
  })

  it('refuses providers without a built-in importer and bad input', async () => {
    db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES ('acct_test_cal9','CREDIT_CARD','cal','כאל בדוי',1900000000009);`)
    expect((await setMode('acct_test_cal9', 'custom')).status).toBe(422)
    expect((await setMode('acct_test_max2', 'sideways')).status).toBe(400)
    expect((await setMode('acct_nope', 'custom')).status).toBe(404)
  })
})

describe('Leumi through a custom mapping', () => {
  it('imports the HTML export with a header lower than the layout and skips rows with no amount', async () => {
    const res = await setMode('acct_leumi', 'custom')
    const { profile } = await res.json()
    const result = await mod.importUpload(await acct('acct_leumi'), leumiHtmlWithBalance(), 'leumi-fake.xls', { profileId: profile.id })
    expect(result).toMatchObject({ ok: true, created: 2 })
    const rows = db.query<{ description: string; debit: number; credit: number; balance: number }>(
      `SELECT description, debit, credit, balance FROM "BankTransaction" WHERE accountId = 'acct_leumi' ORDER BY date`
    )
    expect(rows).toEqual([
      { description: 'חנות בדויה', debit: 12, credit: 0, balance: 100 },
      { description: 'הפקדה בדויה', debit: 0, credit: 30, balance: 100 },
    ])
    // the preview finds the seeded profile though the header moved
    const body = await (await preview(leumiHtmlWithBalance(), 'leumi-fake.xls', 'acct_leumi')).json()
    expect(body.mapper.profile).toMatchObject({ id: profile.id })
    expect(body.mapper.profile.mapping.headerRow).toBe(2)
  })

  it('goes back to the built-in parser', async () => {
    await setMode('acct_leumi', 'builtin')
    const res = await mod.importUpload(await acct('acct_leumi'), leumiHtml(), 'leumi-fake-2.xls')
    expect(res).toMatchObject({ ok: true, created: 2 })
  })
})
