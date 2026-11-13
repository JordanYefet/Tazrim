import fs from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

let db: TestDb

beforeAll(() => {
  db = createTestDb()
  usePrismaOn(db)
})
// lib/updates/settings' CACHE_KEY; not imported, that would load Prisma before usePrismaOn
const CACHE_KEY = 'updates.cache'

/** The daily check found this version (made-up) */
function cacheLatest(version: string | null) {
  db.exec(`DELETE FROM "Setting" WHERE key = '${CACHE_KEY}'`)
  if (!version) return
  const value = JSON.stringify({
    latest: { version, url: 'https://example.invalid/r', notes: [], publishedAt: '2030-01-01T00:00:00Z' },
    checkedAt: '2030-01-01T09:00:00.000Z',
    error: null,
  })
  db.exec(`INSERT INTO "Setting" ("key","value") VALUES ('${CACHE_KEY}', '${value}')`)
}

beforeEach(() => {
  fs.writeFileSync(path.join(path.dirname(db.file), '.updater-token'), 'e'.repeat(64))
  cacheLatest('1.2.0')
})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(path.join(path.dirname(db.file), '.updater-token'), { force: true })
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const helperSays = (status: number, error?: string, code?: string) =>
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(error || code ? { error, code } : { job: {} }), { status }))))
const start = (version: unknown = '1.2.0') =>
  new Request('http://localhost/api/updates/start', { method: 'POST', body: JSON.stringify({ version }) })

describe('POST /api/updates/start', () => {
  it.each([
    [400, 'Version 1.2.0 is not newer than the running 1.2.0.', 400, 'NOT_NEWER'],
    [409, 'An update or rollback is already running.', 409, 'BUSY'],
    [422, "Can't find the Tazrim container: docker said no", 422, 'NOT_UPDATABLE'],
    [500, 'boom', 500, 'HELPER_ERROR'],
    [401, 'unauthorized', 503, 'NO_HELPER'],
  ])('maps the helper %i to %s', async (helperStatus, text, status, code) => {
    helperSays(helperStatus, text)
    const { POST } = await import('../start/route')
    const res = await POST(start())
    const body = await res.json()
    expect(res.status).toBe(status)
    expect(body.code).toBe(code)
    expect(JSON.stringify(body)).not.toMatch(/docker|Version 1|running 1|boom/)
    expect(body.error).toMatch(/[֐-׿]/)
  })

  it('answers NO_HELPER when the helper is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))))
    const { POST } = await import('../start/route')
    const res = await POST(start())
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('NO_HELPER')
  })

  it('answers 202 when the helper accepts, and 400 for a bad version without calling it', async () => {
    helperSays(202)
    const { POST } = await import('../start/route')
    expect((await POST(start())).status).toBe(202)
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    expect((await POST(start('1.2'))).status).toBe(400)
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
  })
})

describe('POST /api/updates/start: only the version the check found', () => {
  it('refuses any other version without asking the helper', async () => {
    helperSays(202)
    const { POST } = await import('../start/route')
    for (const v of ['1.3.0', '1.1.0']) {
      const res = await POST(start(v))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('NOT_LATEST')
      expect(body.error).toMatch(/[֐-׿]/)
    }
    cacheLatest(null)
    expect((await (await POST(start('1.2.0'))).json()).code).toBe('NOT_LATEST')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('the helper code wins over its text', () => {
  it.each([
    ['rollback', 409, 'The backup from before the update is gone.', 'BUSY', 'BUSY'],
    ['rollback', 409, 'An update or rollback is already running.', 'NO_ROLLBACK', 'NO_ROLLBACK'],
    ['start', 400, 'Version 1.2.0 is not newer than the running 1.2.0.', 'INVALID_VERSION', 'HELPER_ERROR'],
    ['start', 409, 'whatever', 'BUSY', 'BUSY'],
    ['start', 400, 'whatever', 'NOT_NEWER', 'NOT_NEWER'],
    ['start', 422, 'whatever', 'NOT_UPDATABLE', 'NOT_UPDATABLE'],
  ])('%s: helper %i (text: %s) with code %s -> %s', async (route, helperStatus, text, helperCode, code) => {
    helperSays(helperStatus, text, helperCode)
    const res = route === 'start' ? await (await import('../start/route')).POST(start()) : await (await import('../rollback/route')).POST()
    const body = await res.json()
    expect(body.code).toBe(code)
    expect(body.error).toMatch(/[֐-׿]/)
  })
})

describe('POST /api/updates/rollback', () => {
  it.each([
    [409, 'An update or rollback is already running.', 'BUSY'],
    [409, 'The backup from before the update is gone.', 'NO_ROLLBACK'],
    [422, 'x', 'NOT_UPDATABLE'],
  ])('maps the helper %i (%s) to %s', async (helperStatus, text, code) => {
    helperSays(helperStatus, text)
    const { POST } = await import('../rollback/route')
    const res = await POST()
    const body = await res.json()
    expect(body.code).toBe(code)
    expect(JSON.stringify(body)).not.toMatch(/backup from|already running/)
  })

  it('answers 202 when accepted', async () => {
    helperSays(202)
    const { POST } = await import('../rollback/route')
    expect((await POST()).status).toBe(202)
  })
})
