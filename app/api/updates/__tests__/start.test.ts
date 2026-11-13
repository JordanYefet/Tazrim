import fs from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

let db: TestDb

beforeAll(() => {
  db = createTestDb()
  usePrismaOn(db)
})
beforeEach(() => {
  fs.writeFileSync(path.join(path.dirname(db.file), '.updater-token'), 'e'.repeat(64))
})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(path.join(path.dirname(db.file), '.updater-token'), { force: true })
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const helperSays = (status: number, error?: string) =>
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(error ? { error } : { job: {} }), { status }))))
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
