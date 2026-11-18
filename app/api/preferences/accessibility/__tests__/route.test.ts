import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

// GET / PUT the signed-in person's accessibility options. Made-up people only.

const owner = vi.fn<() => Promise<string | null | undefined>>()
vi.mock('@/lib/preferences/owner', () => ({ preferenceOwner: () => owner() }))

let db: TestDb
let route: typeof import('../route')
const put = (body: unknown) =>
  new Request('http://localhost/api/preferences/accessibility', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const ALL_ON = { size: 150, font: true, bold: true, spacing: true, contrast: true, cb: true, still: true, focus: true, underline: true }
const ALL_OFF = { size: 100, font: false, bold: false, spacing: false, contrast: false, cb: false, still: false, focus: false, underline: false }

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

describe('/api/preferences/accessibility', () => {
  it('nothing stored yet: null', async () => {
    owner.mockResolvedValue('p_fake')
    expect(await (await route.GET()).json()).toEqual({ value: null })
  })

  it('PUT stores it for the person, returns it, sets the cookie copy; GET returns it', async () => {
    owner.mockResolvedValue('p_fake')
    const res = await route.PUT(put(ALL_ON))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ value: ALL_ON })
    expect(res.headers.get('set-cookie')).toContain('tazrim_a11y=')
    expect(await (await route.GET()).json()).toEqual({ value: ALL_ON })
    const rows = db.query(`SELECT value FROM "PersonPreference" WHERE personId = 'p_fake' AND key = 'a11y'`) as { value: string }[]
    expect(JSON.parse(rows[0].value)).toEqual(ALL_ON)
  })

  it('refuses options that are not options', async () => {
    owner.mockResolvedValue('p_fake')
    for (const body of [null, [], 'x', { ...ALL_ON, size: 120 }, { ...ALL_ON, bold: 'yes' }, { size: 100 }]) {
      expect((await route.PUT(put(body))).status).toBe(400)
    }
    expect(await (await route.GET()).json()).toEqual({ value: ALL_ON })
  })

  it('the reset (all off) is stored as such', async () => {
    owner.mockResolvedValue('p_fake')
    expect((await route.PUT(put(ALL_OFF))).status).toBe(200)
    expect(await (await route.GET()).json()).toEqual({ value: ALL_OFF })
  })

  it('with nowhere to store it (the read-only demo, no session): only the cookie is set', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '1')
    owner.mockResolvedValue(undefined)
    const res = await route.PUT(put({ ...ALL_OFF, size: 130, cb: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ value: { ...ALL_OFF, size: 130, cb: true } })
    expect(res.headers.get('set-cookie')).toContain('tazrim_a11y=')
    expect(await (await route.GET()).json()).toEqual({ value: null })
  })

  it('with the login off: one value for the household', async () => {
    owner.mockResolvedValue(null)
    expect((await route.PUT(put({ ...ALL_OFF, still: true }))).status).toBe(200)
    expect(await (await route.GET()).json()).toEqual({ value: { ...ALL_OFF, still: true } })
  })
})
