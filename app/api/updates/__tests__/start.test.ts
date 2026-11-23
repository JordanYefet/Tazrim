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
    [400, 'Version 1.2.0 is not newer than the running 1.2.0.', 'NOT_NEWER', 400, 'NOT_NEWER'],
    [409, 'An update or rollback is already running.', 'BUSY', 409, 'BUSY'],
    [422, "Can't find the Tazrim container: docker said no", 'NOT_UPDATABLE', 422, 'NOT_UPDATABLE'],
    [500, 'boom', undefined, 500, 'HELPER_ERROR'],
    [401, 'unauthorized', undefined, 503, 'NO_HELPER'],
    // a launcher that doesn't know the job (or an older one) is no helper for this
    [404, 'not found', undefined, 503, 'NO_HELPER'],
  ])('maps the job answer %i to %s', async (helperStatus, text, helperCode, status, code) => {
    helperSays(helperStatus, text, helperCode)
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

  it('answers 202 when the helper accepts, asking for the update job, and 400 for a bad version without calling it', async () => {
    helperSays(202)
    const { POST } = await import('../start/route')
    expect((await POST(start())).status).toBe(202)
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(new URL(url).pathname).toBe('/v1/jobs/update')
    expect(JSON.parse(String(init.body))).toEqual({ version: '1.2.0' })
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
    ['start', 500, 'whatever', 'JOB_FAILED', 'HELPER_ERROR'],
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
    [409, 'An update or rollback is already running.', 'BUSY', 'BUSY'],
    [409, 'The backup from before the update is gone.', 'NO_ROLLBACK', 'NO_ROLLBACK'],
    [422, 'x', 'NOT_UPDATABLE', 'NOT_UPDATABLE'],
  ])('maps the helper %i (%s) with code %s to %s', async (helperStatus, text, helperCode, code) => {
    helperSays(helperStatus, text, helperCode)
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
    expect(new URL((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string).pathname).toBe('/v1/jobs/rollback')
  })
})

// ---- the compose files an update brings (ENG-137) ----------------------------------------------

const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)
const withCompose = (compose: unknown, version = '1.2.0') =>
  new Request('http://localhost/api/updates/start', { method: 'POST', body: JSON.stringify({ version, compose }) })
const sent = () => JSON.parse(String(((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, RequestInit])[1].body))

describe('POST /api/updates/start: what was confirmed about the compose files', () => {
  it('passes the confirmed hashes and the approval to the job, and nothing else of what the browser sent', async () => {
    helperSays(202)
    const { POST } = await import('../start/route')
    const compose = { files: { 'docker-compose.yml': H1 }, approval: { flowId: 'flow-1', password: 'fake approval password', extra: 'x' }, other: 1 }
    expect((await POST(withCompose(compose))).status).toBe(202)
    expect(sent()).toEqual({ version: '1.2.0', compose: { files: { 'docker-compose.yml': H1 }, approval: { flowId: 'flow-1', password: 'fake approval password' } } })

    expect((await POST(withCompose({ files: { 'docker-compose.egress.yml': H2 }, approval: { response: { id: 'cred', response: {} } } }))).status).toBe(202)
    expect(sent().compose.approval).toEqual({ response: { id: 'cred', response: {} } })
  })

  it('sends no compose when none was given', async () => {
    helperSays(202)
    const { POST } = await import('../start/route')
    await POST(start())
    expect(sent()).toEqual({ version: '1.2.0' })
  })

  it('a malformed confirmation never reaches the job: COMPOSE_NEEDS_CONFIRM', async () => {
    helperSays(202)
    const { POST } = await import('../start/route')
    for (const compose of [null, 'x', { files: { '.env': H1 } }, { files: { 'docker-compose.yml': 'short' } }, { files: {}, approval: { password: 'x' } }, { files: { 'docker-compose.yml': H1 }, approval: 7 }]) {
      const res = await POST(withCompose(compose))
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('COMPOSE_NEEDS_CONFIRM')
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    [409, 'COMPOSE_NEEDS_CONFIRM', 409],
    [409, 'COMPOSE_CHANGED', 409],
    [502, 'COMPOSE_FETCH_FAILED', 502],
    [403, 'BAD_PASSWORD', 403],
    [429, 'LOCKED', 429],
    [403, 'BAD_SIGNATURE', 403],
    [409, 'CHALLENGE_UNKNOWN', 409],
  ])('the job refusing with %i %s says it in Hebrew with the same code (even a 403 is not "no helper")', async (helperStatus, helperCode, status) => {
    helperSays(helperStatus, 'English detail from the job', helperCode)
    const { POST } = await import('../start/route')
    const res = await POST(withCompose({ files: { 'docker-compose.yml': H1 } }))
    const body = await res.json()
    expect(res.status).toBe(status)
    expect(body.code).toBe(helperCode)
    expect(body.error).toMatch(/[֐-׿]/)
    expect(body.error).not.toMatch(/English detail/)
  })

  it('a locked password says until when', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ code: 'LOCKED', until: '2030-01-01T10:15:00.000Z' }), { status: 429 }))))
    const { POST } = await import('../start/route')
    const body = await (await POST(withCompose({ files: { 'docker-compose.yml': H1 } }))).json()
    expect(body).toMatchObject({ code: 'LOCKED', until: '2030-01-01T10:15:00.000Z' })
  })

  it('the log keeps only the keys of this route (it may carry an approval password)', async () => {
    const { isSensitiveRoute } = await import('@/lib/log/route')
    expect(isSensitiveRoute('/api/updates/start')).toBe(true)
    expect(isSensitiveRoute('/api/updates/plan')).toBe(false)
  })
})

describe('POST /api/updates/plan', () => {
  const plan = (version: unknown = '1.2.0') => new Request('http://localhost/api/updates/plan', { method: 'POST', body: JSON.stringify({ version }) })
  const PLAN = {
    version: '1.2.0',
    applicable: true,
    files: [
      { name: 'docker-compose.yml', action: 'replace', diff: '-a\n+b', sha256: H1, secret: 'LEAK' },
      { name: '.env', action: 'replace', diff: 'LEAK', sha256: H2 },
    ],
    needsApproval: true,
    approvers: true,
    step: true,
    leak: 'LEAK',
  }
  const jobSays = (status: number, json: unknown) => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(json), { status }))))

  it('asks the update-plan job and answers the plan with its known fields only', async () => {
    jobSays(200, PLAN)
    const { POST } = await import('../plan/route')
    const res = await POST(plan())
    expect(res.status).toBe(200)
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(new URL(url).pathname).toBe('/v1/jobs/update-plan')
    expect(JSON.parse(String(init.body))).toEqual({ version: '1.2.0' })
    const body = await res.json()
    expect(body).toEqual({
      version: '1.2.0',
      applicable: true,
      files: [{ name: 'docker-compose.yml', action: 'replace', diff: '-a\n+b', sha256: H1 }],
      needsApproval: true,
      approvers: true,
      step: true,
    })
    expect(JSON.stringify(body)).not.toContain('LEAK')
  })

  it('only the version the check found, and a real version', async () => {
    jobSays(200, PLAN)
    const { POST } = await import('../plan/route')
    expect((await (await POST(plan('1.3.0'))).json()).code).toBe('NOT_LATEST')
    expect((await POST(plan('1.2'))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('says COMPOSE_FETCH_FAILED (502) when GitHub does not answer the job, and NO_HELPER without a helper', async () => {
    jobSays(502, { code: 'COMPOSE_FETCH_FAILED', error: 'timed out' })
    const { POST } = await import('../plan/route')
    const res = await POST(plan())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.code).toBe('COMPOSE_FETCH_FAILED')
    expect(body.error).toMatch(/[֐-׿]/)

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))))
    const none = await POST(plan())
    expect(none.status).toBe(503)
    expect((await none.json()).code).toBe('NO_HELPER')
  })

  it('an old job container that does not know update-plan is no helper for this', async () => {
    jobSays(404, { error: 'UNKNOWN_JOB' })
    const { POST } = await import('../plan/route')
    expect((await (await POST(plan())).json()).code).toBe('NO_HELPER')
  })
})
