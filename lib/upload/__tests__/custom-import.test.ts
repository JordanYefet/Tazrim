import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { leumiHtml, maxXlsx, maxXlsxWithPending, TEST_ACCOUNTS_SQL } from './fixtures'
import { bankSignedCsv, sheetOf } from '@/lib/import/__tests__/fixtures'
import { headerSignature, suggestMapping } from '@/lib/import/mapping'
import { buildSnapshot } from '@/lib/import/snapshot'
import { readRawGrid } from '@/lib/parsers/raw-grid'

// ENG-69: header storage, file-less edits, and Leumi / Max through their mappings
// (every provider imports through a mapping; there are no built-in readers).
// Every value is made up; dates are in 2030.

let db: TestDb
let mod: typeof import('../import')
let accounts: typeof import('@/lib/db/accounts')
let profilesRoute: typeof import('@/app/api/import-profiles/route')
let profileRoute: typeof import('@/app/api/import-profiles/[id]/route')
let previewRoute: typeof import('@/app/api/upload/preview/route')

beforeAll(async () => {
  db = createTestDb()
  db.exec(TEST_ACCOUNTS_SQL)
  usePrismaOn(db)
  mod = await import('../import')
  accounts = await import('@/lib/db/accounts')
  profilesRoute = await import('@/app/api/import-profiles/route')
  profileRoute = await import('@/app/api/import-profiles/[id]/route')
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
const preview = (buf: Buffer, name: string, accountId: string) => {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(buf)], name))
  form.append('accountId', accountId)
  return previewRoute.POST(new Request('http://localhost/api/upload/preview', { method: 'POST', body: form }))
}

/** Leumi's HTML export with one more table on top, so the header is a row lower than usual. */
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
    expect(body).toMatchObject({ id, kind: 'bank', mapping, snapshot: headers, account: { id: 'acct_test_other' } })
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

/** The mapper's suggestion for a file, as the upload page starts from it */
function suggestionFor(buf: Buffer, name: string, kind: 'bank' | 'card') {
  const wb = readRawGrid(buf, name)
  const index = Math.max(0, wb.sheets.findIndex(sh => sh.rows.length > 0))
  const mapping = suggestMapping(wb.sheets[index], kind, index)
  return { wb, sheet: wb.sheets[index], mapping }
}

describe('Max through its mapping', () => {
  let profileId: string

  it('the upload preview offers the mapper, pre-filled from the file', async () => {
    const body = await (await preview(maxXlsxWithPending(), 'max-fake.xlsx', 'acct_test_max2')).json()
    expect(body.importSupported).toBe(true)
    expect(body.customImport).toBeUndefined()
    expect(body.mapper.kind).toBe('card')
    expect(body.mapper.profile).toBeNull()
    expect(body.mapper.suggestion).toMatchObject({ headerRow: 3, billingDate: { from: 'column' } })
  })

  it('imports a multi-sheet export with the suggestion, leaving the pending sheet out', async () => {
    const { mapping } = suggestionFor(maxXlsxWithPending(), 'max-fake.xlsx', 'card')
    const res = await mod.importUpload(await acct('acct_test_max2'), maxXlsxWithPending(), 'max-pending-fake.xlsx', { mapping })
    expect(res).toMatchObject({ ok: true, created: 1, skipped: 0, pending: 2 })
    const rows = db.query<{ originalMerchantName: string; chargedAmount: number }>(
      `SELECT originalMerchantName, chargedAmount FROM "CreditCardTransaction" WHERE accountId = 'acct_test_max2'`
    )
    expect(rows).toEqual([{ originalMerchantName: 'עסק בדוי אחר', chargedAmount: 22 }])
  })

  it('a saved mapping is found again for the next file, and imports with it', async () => {
    const { sheet, mapping } = suggestionFor(maxXlsxWithPending(), 'max-fake.xlsx', 'card')
    const res = await profilesRoute.POST(
      json('POST', {
        accountId: 'acct_test_max2',
        name: 'מקס בדוי',
        mapping,
        headerSignature: headerSignature(sheet, mapping.headerRow),
        headers: buildSnapshot(sheet, mapping, 'card'),
        linkAccount: true,
      })
    )
    expect(res.status).toBe(201)
    profileId = (await res.json()).id

    const body = await (await preview(maxXlsxWithPending(), 'max-fake.xlsx', 'acct_test_max2')).json()
    expect(body.mapper.profile).toMatchObject({ id: profileId, linked: true })
    const again = await mod.importUpload(await acct('acct_test_max2'), maxXlsxWithPending(), 'max-pending-fake-2.xlsx', { profileId })
    // the billed row is already there, the pending ones still left out
    expect(again).toMatchObject({ ok: true, created: 0, skipped: 1, pending: 2 })
  })

  it('a plain Max export imports through the same saved mapping', async () => {
    const res = await mod.importUpload(await acct('acct_test_max2'), maxXlsx(), 'max-fake.xlsx', { profileId })
    expect(res).toMatchObject({ ok: true, created: 1 })
  })
})

describe('Leumi through its mapping', () => {
  it('imports the HTML export with a header lower than usual and skips rows with no amount', async () => {
    const { mapping } = suggestionFor(leumiHtmlWithBalance(), 'leumi-fake.xls', 'bank')
    const result = await mod.importUpload(await acct('acct_leumi'), leumiHtmlWithBalance(), 'leumi-fake.xls', { mapping })
    expect(result).toMatchObject({ ok: true, created: 2 })
    const rows = db.query<{ description: string; debit: number; credit: number; balance: number }>(
      `SELECT description, debit, credit, balance FROM "BankTransaction" WHERE accountId = 'acct_leumi' ORDER BY date`
    )
    expect(rows).toEqual([
      { description: 'חנות בדויה', debit: 12, credit: 0, balance: 100 },
      { description: 'הפקדה בדויה', debit: 0, credit: 30, balance: 100 },
    ])
  })

  it('the preview suggests the header where it is', async () => {
    const body = await (await preview(leumiHtmlWithBalance(), 'leumi-fake.xls', 'acct_leumi')).json()
    expect(body.mapper.suggestion).toMatchObject({ headerRow: 2, amountMode: 'split' })
  })
})

describe('a saved mapping from before the reference existed', () => {
  it('still stores the file’s אסמכתא when it imports', async () => {
    const csv = Buffer.from('תאריך,תיאור,אסמכתא,חובה,זכות\n01/09/2030,העברה בדויה,55512,90,\n02/09/2030,הפקדה בדויה,55513,,40\n')
    const sheet = sheetOf(csv, 'ref.csv')
    const { reference: _r, ...older } = suggestMapping(sheet, 'bank').columns
    const mapping = { ...suggestMapping(sheet, 'bank'), columns: older }
    const res = await profilesRoute.POST(
      json('POST', {
        accountId: 'acct_leumi',
        name: 'בנק בדוי ישן',
        mapping,
        headerSignature: headerSignature(sheet, mapping.headerRow),
        headers: buildSnapshot(sheet, mapping, 'bank'),
      })
    )
    expect(res.status).toBe(201)
    const { id } = await res.json()

    const imported = await mod.importUpload(await acct('acct_leumi'), csv, 'ref.csv', { profileId: id })
    expect(imported).toMatchObject({ ok: true, created: 2 })
    expect(db.query(`SELECT reference FROM "BankTransaction" WHERE sourceFile = 'ref.csv' ORDER BY date`)).toEqual([
      { reference: '55512' },
      { reference: '55513' },
    ])
  })
})
