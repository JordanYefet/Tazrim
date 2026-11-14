import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

// GET / PUT the signed-in person's page background. Made-up people only.

const owner = vi.fn<() => Promise<string | null | undefined>>()
vi.mock('@/lib/preferences/owner', () => ({ preferenceOwner: () => owner() }))

let db: TestDb
let route: typeof import('../route')
const put = (body: unknown) =>
  new Request('http://localhost/api/preferences/background', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Person" ("id","name","createdAt") VALUES ('p_fake','Fake',1900000000000);`)
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

describe('/api/preferences/background', () => {
  it('nothing stored yet: null', async () => {
    owner.mockResolvedValue('p_fake')
    expect(await (await route.GET()).json()).toEqual({ value: null })
  })

  it('PUT stores it for the person (in its normal form), GET returns it', async () => {
    owner.mockResolvedValue('p_fake')
    const res = await route.PUT(put({ value: 'grid.10.indigo-pink' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ value: 'grid.10.indigo-pink' })
    expect(await (await route.GET()).json()).toEqual({ value: 'grid.10.indigo-pink' })
    expect(db.query(`SELECT value FROM "PersonPreference" WHERE personId = 'p_fake'`)).toEqual([{ value: 'grid.10.indigo-pink' }])
  })

  it('refuses a value that is not a background', async () => {
    owner.mockResolvedValue('p_fake')
    for (const value of ['nope.10.ocean', 'lines.10', 42, '', 'lines.10.ocean.extra']) {
      expect((await route.PUT(put({ value }))).status).toBe(400)
    }
    expect(await (await route.GET()).json()).toEqual({ value: 'grid.10.indigo-pink' })
  })

  it('the read-only demo saves nothing', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '1')
    owner.mockResolvedValue(undefined)
    expect((await route.PUT(put({ value: 'aurora.10.indigo-pink' }))).status).toBe(403)
    expect(await (await route.GET()).json()).toEqual({ value: null })
  })

  it('with the login off: one background for the household', async () => {
    owner.mockResolvedValue(null)
    expect((await route.PUT(put({ value: 'waves.10.grey' }))).status).toBe(200)
    expect(await (await route.GET()).json()).toEqual({ value: 'waves.10.grey' })
  })
})
