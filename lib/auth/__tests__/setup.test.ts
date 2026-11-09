/**
 * First run (ENG-89): the setup code from TAZRIM_SETUP_CODE in .env (else the
 * log's), and setting up with a password instead of a passkey.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

const HEADERS = { host: 'localhost:3000', 'x-forwarded-host': 'tazrim.home.arpa', 'x-forwarded-proto': 'https' }
let db: TestDb

async function setup(body: unknown, headers: Record<string, string> = HEADERS) {
  const { POST } = await import('@/app/api/auth/setup/route')
  const res = await POST(new Request('http://localhost:3000/api/auth/setup', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }))
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') }
}

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
})
afterEach(async () => {
  delete process.env.TAZRIM_SETUP_CODE
  ;(await import('../rate-limit')).resetRateLimits()
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('the setup code', () => {
  it('comes from TAZRIM_SETUP_CODE when it is long enough, typed in any case', async () => {
    const h = await import('../household')
    process.env.TAZRIM_SETUP_CODE = 'Kitchen-Table-42'
    expect(h.setupCodeSource()).toBe('env')
    expect(h.setupCode()).toBe('Kitchen-Table-42')
    expect(h.checkSetupCode('kitchen table 42')).toBe(true)
    expect(h.checkSetupCode('kitchen-table-43')).toBe(false)
  })

  it('falls back to a code in the log when the one in .env is short or missing', async () => {
    const h = await import('../household')
    process.env.TAZRIM_SETUP_CODE = 'short'
    expect(h.setupCodeSource()).toBe('log')
    const logged = h.setupCode()
    expect(logged).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect(h.checkSetupCode('short')).toBe(false)
    expect(h.checkSetupCode(logged)).toBe(true)
  })
})

describe('POST /api/auth/setup (with a password)', () => {
  it('needs the code and a long enough password; with TAZRIM_REQUIRE_HTTPS, only over https or on this computer', async () => {
    process.env.TAZRIM_SETUP_CODE = 'Kitchen-Table-42'
    expect((await setup({ code: 'wrong-code-00', name: 'Owner', password: 'a long password' })).status).toBe(401)
    expect((await setup({ code: 'Kitchen-Table-42', name: 'Owner', password: 'short' })).status).toBe(400)
    process.env.TAZRIM_REQUIRE_HTTPS = '1'
    try {
      const plain = { host: 'tazrim.example.lan' }
      expect((await setup({ code: 'Kitchen-Table-42', name: 'Owner', password: 'a long password' }, plain)).status).toBe(400)
    } finally {
      delete process.env.TAZRIM_REQUIRE_HTTPS
    }
    expect(db.query<{ n: number }>('SELECT COUNT(*) AS n FROM "Person"')[0].n).toBe(0)
  })

  it('creates the first person, signs in, returns a recovery code, then is closed', async () => {
    process.env.TAZRIM_SETUP_CODE = 'Kitchen-Table-42'
    const done = await setup({ code: 'Kitchen-Table-42', name: 'Owner', password: 'a long password' })
    expect(done.status).toBe(200)
    expect(done.body.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
    expect(done.cookie).toMatch(/tazrim_session=[^;]+/)
    const { checkPassword } = await import('../household')
    expect(await checkPassword('owner', 'a long password')).not.toBeNull()
    expect((await setup({ code: 'Kitchen-Table-42', name: 'Second', password: 'a long password' })).status).toBe(409)
  })
})
