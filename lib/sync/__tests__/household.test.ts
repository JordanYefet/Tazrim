import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '../../db/__tests__/test-db'

// ENG-102: the sync offers only the companies the household's accounts belong to.
// Made-up accounts only.

let db: TestDb
let route: typeof import('@/app/api/sync/route')
let store: typeof import('../store')
let providers: typeof import('../providers')

beforeAll(async () => {
  db = createTestDb()
  // Next to the default Leumi and MAX accounts: a Cal card, a second Cal card,
  // an upload-only card and an archived Isracard
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","cardLastFour","archived","createdAt") VALUES
    ('a_cal','CREDIT_CARD','cal','Fake club card',NULL,false,1900000000001),
    ('a_cal2','CREDIT_CARD','cal','Fake second card','4321',false,1900000000002),
    ('a_upload','CREDIT_CARD','fake issuer','Fake upload card',NULL,false,1900000000003),
    ('a_old','CREDIT_CARD','isracard','Fake old card',NULL,true,1900000000004);`)
  usePrismaOn(db)
  route = await import('@/app/api/sync/route')
  store = await import('../store')
  providers = await import('../providers')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const req = (method = 'GET', body?: unknown) =>
  new Request('http://localhost/api/sync', {
    method,
    headers: { 'content-type': 'application/json', host: 'localhost:3000' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('GET /api/sync', () => {
  it('lists exactly the companies the active accounts sync through, with their accounts', async () => {
    const data = await (await route.GET(req())).json()
    expect(data.companies.map((c: { id: string; accounts: string[] }) => [c.id, c.accounts.length])).toEqual([
      ['leumi', 1],
      ['max', 1],
      ['visaCal', 2],
    ])
  })
})

describe('POST /api/sync', () => {
  it('refuses a company the household has no account with', async () => {
    const res = await route.POST(req('POST', { company: 'isracard', credentials: {}, startDate: '2030-01-01' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('NO_ACCOUNTS')
  })
})

describe('linking a found card', () => {
  it('offers only the company\'s own accounts', async () => {
    const cal = providers.syncCompany('visaCal')!
    const ids = (await store.linkCandidates(cal)).map(a => a.id)
    expect(ids).toEqual(['a_cal', 'a_cal2'])
  })

  it('suggests the card with the same digits, else nothing when several could fit', async () => {
    const cal = providers.syncCompany('visaCal')!
    const candidates = await store.linkCandidates(cal)
    expect(store.suggestAccount(cal, '4321', candidates)).toBe('a_cal2')
    expect(store.suggestAccount(cal, '9999', candidates)).toBeNull()
    // The company's only card, digits not known yet: linked by default
    expect(store.suggestAccount(cal, '9999', candidates.filter(a => a.id === 'a_cal'))).toBe('a_cal')
  })

  it('refuses to link to another company\'s account', async () => {
    const cal = providers.syncCompany('visaCal')!
    await expect(store.saveLinks(cal, [{ externalAccount: '1111', action: 'link', accountId: 'acct_max' }])).rejects.toThrow('INVALID_ACCOUNT')
  })
})
