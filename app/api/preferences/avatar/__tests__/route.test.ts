import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

// PUT the signed-in person's own avatar. Made-up people only.

const owner = vi.fn<() => Promise<string | null | undefined>>()
vi.mock('@/lib/preferences/owner', () => ({ preferenceOwner: () => owner() }))

let db: TestDb
let route: typeof import('../route')
const put = (body: unknown) =>
  new Request('http://localhost/api/preferences/avatar', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const art = { kind: 'art', set: 'notionists', seed: 'tamar', bg: 1 }

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Person" ("id","name","createdAt") VALUES ('p_fake','Fake',1900000000000), ('p_other','Other',1900000000000);`)
  usePrismaOn(db)
  route = await import('../route')
})
afterEach(() => {
  vi.unstubAllEnvs()
  owner.mockReset()
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('PUT /api/preferences/avatar', () => {
  it('stores it for the signed-in person only', async () => {
    owner.mockResolvedValue('p_fake')
    const res = await route.PUT(put(art))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ avatar: art })
    expect(db.query(`SELECT personId, key FROM "PersonPreference"`)).toEqual([{ personId: 'p_fake', key: 'avatar' }])
  })

  it('replaces the previous one', async () => {
    owner.mockResolvedValue('p_fake')
    await route.PUT(put({ kind: 'text', text: 'ד', ink: 0, bg: 0 }))
    expect(db.query(`SELECT value FROM "PersonPreference" WHERE personId = 'p_fake'`)).toHaveLength(1)
  })

  it('401 with no session or the login off', async () => {
    owner.mockResolvedValue(undefined)
    expect((await route.PUT(put(art))).status).toBe(401)
    owner.mockResolvedValue(null)
    expect((await route.PUT(put(art))).status).toBe(401)
  })

  it('403 in the read-only demo', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '1')
    owner.mockResolvedValue(undefined)
    expect((await route.PUT(put(art))).status).toBe(403)
  })

  it('400 for an invalid avatar', async () => {
    owner.mockResolvedValue('p_other')
    for (const body of [{ ...art, set: 'nope' }, { kind: 'text', text: '', ink: 0, bg: 0 }, null, 'x']) {
      expect((await route.PUT(put(body))).status).toBe(400)
    }
    expect(db.query(`SELECT 1 FROM "PersonPreference" WHERE personId = 'p_other'`)).toEqual([])
  })
})
