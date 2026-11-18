/**
 * First run (ENG-89, ENG-119): the setup code from TAZRIM_SETUP_CODE in .env
 * (else the log's), asked from another device but not on the computer itself
 * (the "this computer" door), and always a name and a password.
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
  delete process.env.TAZRIM_LOCAL_PORT
  delete process.env.TAZRIM_LOCAL_SECRET
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

const DOOR_SECRET = 'f'.repeat(64)
const doorOn = () => {
  process.env.TAZRIM_LOCAL_PORT = '3001'
  process.env.TAZRIM_LOCAL_SECRET = DOOR_SECRET
}
const persons = () => db.query<{ n: number }>('SELECT COUNT(*) AS n FROM "Person"')[0].n

describe('the setup code, by where the request came from (ENG-119)', () => {
  const body = { name: 'Owner', password: 'a long password' }

  it('from another device, no code (or a wrong one) is refused, even dressed up as localhost', async () => {
    doorOn()
    process.env.TAZRIM_SETUP_CODE = 'Kitchen-Table-42'
    const spoofs: Record<string, string>[] = [
      { host: '192.168.1.20:3001' },
      { host: 'localhost:3000' },
      { host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1' },
      { host: '127.0.0.1:3000', 'x-forwarded-host': 'localhost', 'x-forwarded-for': '127.0.0.1', 'x-real-ip': '::1' },
      { host: 'localhost:3000', 'x-tazrim-local': 'guess' },
      { host: 'localhost:3000', 'x-tazrim-local': DOOR_SECRET.slice(0, 63) + '0' },
      { host: 'localhost:3000', 'x-tazrim-local': '' },
    ]
    for (const headers of spoofs) {
      expect((await setup(body, headers)).body.code, JSON.stringify(headers)).toBe('BAD_CODE')
      expect((await setup({ ...body, code: 'wrong-code-00' }, headers)).body.code).toBe('BAD_CODE')
    }
    expect(persons()).toBe(0)
  })

  it('with the door off, nothing counts as this computer: the code is asked even with the right header', async () => {
    process.env.TAZRIM_SETUP_CODE = 'Kitchen-Table-42'
    process.env.TAZRIM_LOCAL_SECRET = DOOR_SECRET
    expect((await setup(body, { host: 'localhost:3000', 'x-tazrim-local': DOOR_SECRET })).body.code).toBe('BAD_CODE')
    expect(persons()).toBe(0)
  })

  it('on this computer (through the door) still needs a name and a password', async () => {
    doorOn()
    const here = { host: 'localhost:3000', 'x-tazrim-local': DOOR_SECRET }
    expect((await setup({ name: 'Owner' }, here)).body.code).toBe('BAD_PASSWORD')
    expect((await setup({ name: 'Owner', password: 'short' }, here)).body.code).toBe('BAD_PASSWORD')
    expect((await setup({ name: '  ', password: 'a long password' }, here)).body.code).toBe('NO_NAME')
    expect(persons()).toBe(0)
  })

  it('on this computer needs no code; then setup is closed', async () => {
    doorOn()
    const here = { host: 'localhost:3000', 'x-forwarded-for': '192.168.65.1', 'x-tazrim-local': DOOR_SECRET }
    const done = await setup(body, here)
    expect(done.status).toBe(200)
    expect(done.body.recoveryCode).toBeTruthy()
    expect(done.cookie).toMatch(/tazrim_session=[^;]+/)
    expect((await setup({ name: 'Second', password: 'a long password' }, here)).status).toBe(409)
    const { prisma } = await import('@/lib/db/client')
    await prisma.person.deleteMany()
  })

  it('a passkey alone never sets up', async () => {
    doorOn()
    const { POST } = await import('@/app/api/auth/register/options/route')
    const res = await POST(new Request('http://localhost:3000/api/auth/register/options', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost:3000', 'x-tazrim-local': DOOR_SECRET },
      body: JSON.stringify({ mode: 'setup', name: 'Owner' }),
    }))
    expect((await res.json()).code).toBe('PASSWORD_FIRST')
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
