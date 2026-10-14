import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { leumiHtml, maxXlsx, OTHER_CSV, TEST_ACCOUNTS_SQL } from '@/lib/upload/__tests__/fixtures'
import { bankSignedCsv, sheetOf } from '@/lib/import/__tests__/fixtures'
import { suggestMapping } from '@/lib/import/mapping'

// All values are made up.

let db: TestDb
let POST: (req: Request) => Promise<Response>

beforeAll(async () => {
  db = createTestDb()
  db.exec(TEST_ACCOUNTS_SQL)
  usePrismaOn(db)
  POST = (await import('../route')).POST as unknown as typeof POST
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

function req(fields: { file?: File; accountId?: string; force?: string; mapping?: string; profileId?: string }): Request {
  const form = new FormData()
  if (fields.mapping !== undefined) form.append('mapping', fields.mapping)
  if (fields.profileId !== undefined) form.append('profileId', fields.profileId)
  if (fields.file) form.append('file', fields.file)
  if (fields.accountId) form.append('accountId', fields.accountId)
  if (fields.force !== undefined) form.append('force', fields.force)
  return new Request('http://localhost/api/upload', { method: 'POST', body: form })
}

const leumiFile = () => new File([new Uint8Array(leumiHtml())], 'bank-fake.xls')

describe('POST /api/upload', () => {
  it('400 without a file or account', async () => {
    expect((await POST(req({ accountId: 'acct_leumi' }))).status).toBe(400)
    expect((await POST(req({ file: leumiFile() }))).status).toBe(400)
  })

  it('404 for an unknown account, 409 for an archived one', async () => {
    expect((await POST(req({ file: leumiFile(), accountId: 'acct_nope' }))).status).toBe(404)
    expect((await POST(req({ file: leumiFile(), accountId: 'acct_test_archived' }))).status).toBe(409)
  })

  it('imports into the chosen account, and a second import adds nothing', async () => {
    const first = await POST(req({ file: leumiFile(), accountId: 'acct_leumi' }))
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ created: 2, skipped: 0, skippedRows: [] })

    const second = await POST(req({ file: leumiFile(), accountId: 'acct_leumi' }))
    const body = await second.json()
    expect(body).toMatchObject({ created: 0, skipped: 2 })
    expect(body.skippedRows).toHaveLength(2)
    expect(body.skippedRows[0]).toMatchObject({ index: 0, matchedFile: 'bank-fake.xls' })
    expect(db.query(`SELECT accountId, COUNT(*) AS n FROM "BankTransaction" GROUP BY accountId`)).toEqual([
      { accountId: 'acct_leumi', n: 2 },
    ])
  })

  it('re-uploads a card file and imports the skipped rows the user chose', async () => {
    const card = () => new File([new Uint8Array(maxXlsx())], 'card-fake.xlsx')
    expect(await (await POST(req({ file: card(), accountId: 'acct_max' }))).json()).toMatchObject({ created: 1 })
    const again = await (await POST(req({ file: card(), accountId: 'acct_max' }))).json()
    expect(again).toMatchObject({ created: 0, skipped: 1 })
    const forced = await (await POST(req({ file: card(), accountId: 'acct_max', force: '[0]' }))).json()
    expect(forced).toMatchObject({ created: 1, skipped: 0 })
  })

  it('400 for a malformed force list', async () => {
    for (const force of ['nope', '{}', '[-1]', '[1.5]', '["0"]']) {
      expect((await POST(req({ file: leumiFile(), accountId: 'acct_leumi', force }))).status).toBe(400)
    }
  })

  it('422 UNSUPPORTED_PROVIDER for an account without a parser', async () => {
    const res = await POST(req({ file: new File([new Uint8Array(OTHER_CSV)], 'o.csv'), accountId: 'acct_test_other' }))
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('UNSUPPORTED_PROVIDER')
  })

  it('imports through a mapping sent as JSON, and 400s for bad JSON', async () => {
    const file = () => new File([new Uint8Array(bankSignedCsv())], 'bank-mapped.csv')
    const mapping = JSON.stringify(suggestMapping(sheetOf(bankSignedCsv(), 'b.csv'), 'bank'))
    const res = await POST(req({ file: file(), accountId: 'acct_test_other', mapping }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ created: 2, skipped: 0 })

    const bad = await POST(req({ file: file(), accountId: 'acct_test_other', mapping: '{nope' }))
    expect(bad.status).toBe(400)
    expect((await bad.json()).code).toBe('INVALID_MAPPING')
    const invalid = await POST(req({ file: file(), accountId: 'acct_test_other', mapping: '{"headerRow":1}' }))
    expect(invalid.status).toBe(400)
    const noProfile = await POST(req({ file: file(), accountId: 'acct_test_other', profileId: 'nope' }))
    expect(noProfile.status).toBe(404)
  })
})
