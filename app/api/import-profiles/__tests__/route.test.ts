import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { TEST_ACCOUNTS_SQL } from '@/lib/upload/__tests__/fixtures'
import { bankSignedCsv, sheetOf } from '@/lib/import/__tests__/fixtures'
import { headerSignature, suggestMapping } from '@/lib/import/mapping'

// All values are made up.

let db: TestDb
let list: typeof import('../route')
let one: typeof import('../[id]/route')

beforeAll(async () => {
  db = createTestDb()
  db.exec(TEST_ACCOUNTS_SQL)
  usePrismaOn(db)
  list = await import('../route')
  one = await import('../[id]/route')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const json = (method: string, body: unknown) =>
  new Request('http://localhost/api/import-profiles', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const sheet = sheetOf(bankSignedCsv(), 'b.csv')
const mapping = suggestMapping(sheet, 'bank')

describe('/api/import-profiles', () => {
  let id: string

  it('creates a profile linked to the account and lists it', async () => {
    const res = await list.POST(
      json('POST', { accountId: 'acct_test_other', name: 'בנק בדוי – תנועות', mapping, headerSignature: headerSignature(sheet, 1), linkAccount: true })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    id = body.id
    expect(body).toMatchObject({ name: 'בנק בדוי – תנועות', accountKind: 'BANK', provider: 'otherbank', account: { id: 'acct_test_other' } })
    expect(body.mapping).toBeUndefined()
    const all = await (await list.GET()).json()
    expect(all.map((p: { id: string }) => p.id)).toEqual([id])
  })

  it('400s for an invalid mapping, 404s for an unknown account', async () => {
    expect((await list.POST(json('POST', { accountId: 'acct_test_other', name: 'x', mapping: {}, headerSignature: 'a' }))).status).toBe(400)
    expect((await list.POST(json('POST', { accountId: 'acct_nope', name: 'x', mapping, headerSignature: 'a' }))).status).toBe(404)
    expect((await list.POST(json('POST', 'nope'))).status).toBe(400)
  })

  it('renames and deletes', async () => {
    const renamed = await one.PATCH(json('PATCH', { name: 'שם אחר' }), ctx(id))
    expect(await renamed.json()).toEqual({ id, name: 'שם אחר' })
    expect((await one.PATCH(json('PATCH', { name: '' }), ctx(id))).status).toBe(400)
    expect((await one.PATCH(json('PATCH', {}), ctx(id))).status).toBe(400)
    expect((await one.PATCH(json('PATCH', { name: 'x' }), ctx('nope'))).status).toBe(404)
    expect((await one.DELETE(json('DELETE', null), ctx(id))).status).toBe(200)
    expect((await one.DELETE(json('DELETE', null), ctx(id))).status).toBe(404)
  })
})
