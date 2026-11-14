import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { SESSION_IDLE_MS, isBarePath, isPublicPath } from '../config'
import { normalizeCode, readableCode } from '../tokens'
import { rateLimit } from '../rate-limit'

let db: TestDb
let household: typeof import('../household')
let session: typeof import('../session')
let mw: typeof import('@/middleware')
let relyingParty: typeof import('../webauthn').relyingParty

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  household = await import('../household')
  session = await import('../session')
  mw = await import('@/middleware')
  ;({ relyingParty } = await import('../webauthn'))
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

beforeEach(() => {
  for (const t of ['Session', 'Passkey', 'Invite', 'Person', 'Setting']) db.exec(`DELETE FROM "${t}"`)
  db.exec(`INSERT INTO "Person" ("id","name","createdAt") VALUES ('p1','Owner','2026-01-01'), ('p2','Spouse','2026-01-02')`)
  db.exec(`INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('k1','p1','c1',X'00','Mac'), ('k2','p2','c2',X'00','iPhone')`)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('codes', () => {
  it('readable codes are groups of four and survive case, spaces and look-alikes', () => {
    const code = readableCode(5)
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/)
    expect(normalizeCode(` ${code.toLowerCase().replace(/-/g, ' ')} `)).toBe(normalizeCode(code))
    expect(normalizeCode('o0-Il')).toBe('0011')
  })
})

describe('isPublicPath', () => {
  it.each(['/login', '/setup', '/invite/abc', '/api/auth/login', '/api/health', '/manifest.webmanifest', '/_next/static/x.js'])('%s is public', p =>
    expect(isPublicPath(p)).toBe(true)
  )
  it.each(['/', '/settings', '/api/people', '/api/sync', '/api/data/delete-all', '/loginx', '/api/healthz', '/updating'])('%s needs a session', p =>
    expect(isPublicPath(p)).toBe(false)
  )
})

describe('isBarePath', () => {
  it.each(['/login', '/setup', '/invite/abc', '/updating'])('%s renders without the app shell', p => expect(isBarePath(p)).toBe(true))
  it.each(['/', '/about', '/settings'])('%s keeps the app shell', p => expect(isBarePath(p)).toBe(false))
})

describe('relyingParty', () => {
  it('uses the proxy headers when Caddy is in front', () => {
    const h = new Headers({ host: 'localhost:3000', 'x-forwarded-host': 'tazrim.home.arpa', 'x-forwarded-proto': 'https' })
    expect(relyingParty(h)).toEqual({ rpID: 'tazrim.home.arpa', origin: 'https://tazrim.home.arpa', secure: true })
  })
  it('localhost over http, the port kept in the origin only', () => {
    expect(relyingParty(new Headers({ host: 'localhost:3001' }))).toEqual({ rpID: 'localhost', origin: 'http://localhost:3001', secure: false })
  })
  it('refuses an origin outside TAZRIM_ORIGINS', () => {
    vi.stubEnv('TAZRIM_ORIGINS', 'https://tazrim.home.arpa')
    expect(relyingParty(new Headers({ host: 'evil.example' }))).toBeNull()
    expect(relyingParty(new Headers({ host: 'tazrim.home.arpa', 'x-forwarded-proto': 'https' }))?.rpID).toBe('tazrim.home.arpa')
  })
})

describe('rateLimit', () => {
  it('allows `limit` calls per window', () => {
    const key = `t-${Math.random()}`
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 1000, 0)).toBe(true)
    expect(rateLimit(key, 3, 1000, 10)).toBe(false)
    expect(rateLimit(key, 3, 1000, 1001)).toBe(true)
  })
})

describe('recovery code', () => {
  it('signs in once as the first person, then stops working', async () => {
    const code = await household.newRecoveryCode()
    expect(await household.useRecoveryCode('wrong')).toBeNull()
    expect(await household.useRecoveryCode(code.toLowerCase())).toEqual({ id: 'p1' })
    expect(await household.useRecoveryCode(code)).toBeNull()
  })
  it('a new code replaces the old one', async () => {
    const old = await household.newRecoveryCode()
    const fresh = await household.newRecoveryCode()
    expect(await household.useRecoveryCode(old)).toBeNull()
    expect(await household.useRecoveryCode(fresh)).toEqual({ id: 'p1' })
  })
})

describe('invites', () => {
  it('work once, and not after they expire', async () => {
    const now = new Date('2026-11-07T00:00:00Z')
    const { token } = await household.createInvite('p2', now)
    const found = await household.findInvite(token, now)
    expect(found?.person).toEqual({ id: 'p2', name: 'Spouse' })
    expect(await household.findInvite(token, new Date(now.getTime() + 16 * 60_000))).toBeNull()
    expect(await household.consumeInvite(found!.id, now)).toBe(true)
    expect(await household.consumeInvite(found!.id, now)).toBe(false)
    expect(await household.findInvite(token, now)).toBeNull()
  })
})

describe('sessions and revoking', () => {
  it('a session reads back until idle too long', async () => {
    const token = await session.createSession('p1', 'k1')
    expect((await session.readSession(token))?.personName).toBe('Owner')
    expect(await session.readSession(token, new Date(Date.now() + SESSION_IDLE_MS + 1000))).toBeNull()
    expect(await session.readSession(token)).toBeNull()
  })

  it("revoking a passkey ends that device's sessions; the last passkey can't be revoked", async () => {
    const t1 = await session.createSession('p1', 'k1')
    const t2 = await session.createSession('p2', 'k2')
    expect(await household.revokePasskey('k2')).toBe('ok')
    expect(await session.readSession(t2)).toBeNull()
    expect(await session.readSession(t1)).not.toBeNull()
    expect(await household.revokePasskey('k1')).toBe('last-passkey')
    expect(await household.revokePasskey('nope')).toBe('not-found')
  })

  it('with a password in the household, the last passkey can go; the last way in cannot', async () => {
    expect(await household.revokePasskey('k2')).toBe('ok')
    expect(await household.setPassword('p2', 'a long enough password')).toBe('ok')
    expect(await household.revokePasskey('k1')).toBe('ok')
    // No passkey left anywhere: Spouse's password is the household's only way in
    expect(await household.removePassword('p2')).toBe('last-way-in')
    expect(await household.removePassword('p1')).toBe('no-password')
  })

  it("a password needs a name nobody else has (sign-in asks for it)", async () => {
    db.exec(`UPDATE "Person" SET name = ' spouse' WHERE id = 'p1'`)
    expect(await household.setPassword('p2', 'a long enough password')).toBe('name-taken')
    db.exec(`UPDATE "Person" SET name = 'Owner' WHERE id = 'p1'`)
    expect(await household.setPassword('p2', 'a long enough password')).toBe('ok')
    expect(await household.checkPassword('SPOUSE', 'a long enough password')).toEqual({ id: 'p2' })
    expect(await household.checkPassword('Owner', 'a long enough password')).toBeNull()
  })
})

describe('password hashing', () => {
  it('scrypt with its own salt; only the same password matches', async () => {
    const { hashPassword, verifyPassword, passwordProblem } = await import('../password')
    const a = await hashPassword('סיסמה ארוכה מספיק')
    const b = await hashPassword('סיסמה ארוכה מספיק')
    expect(a).not.toBe(b)
    expect(await verifyPassword('סיסמה ארוכה מספיק', a)).toBe(true)
    expect(await verifyPassword('סיסמה ארוכה מספיק!', a)).toBe(false)
    expect(await verifyPassword('anything', 'garbage')).toBe(false)
    expect(passwordProblem('123456789')).not.toBeNull()
    expect(passwordProblem('1234567890')).toBeNull()
    expect(passwordProblem(undefined)).not.toBeNull()
  })
})

describe('middleware', () => {
  const req = (path: string, cookie?: string) =>
    new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie: `tazrim_session=${cookie}` } : {} })

  it('API calls without a session get 401; pages redirect to /login with next', async () => {
    const api = await mw.middleware(req('/api/summary'))
    expect(api.status).toBe(401)
    const page = await mw.middleware(req('/settings?x=1'))
    expect(page.status).toBe(307)
    expect(page.headers.get('location')).toBe('http://localhost:3000/login?next=%2Fsettings%3Fx%3D1')
  })

  it('a valid session passes; a revoked one does not', async () => {
    const token = await session.createSession('p2', 'k2')
    expect((await mw.middleware(req('/api/summary', token))).status).toBe(200)
    await household.revokePasskey('k2')
    expect((await mw.middleware(req('/api/summary', token))).status).toBe(401)
  })

  it('health and the auth routes stay open', async () => {
    expect((await mw.middleware(req('/api/health'))).status).toBe(200)
    expect((await mw.middleware(req('/api/auth/options'))).status).toBe(200)
    expect((await mw.middleware(req('/login'))).status).toBe(200)
  })

  it('no login in the read-only demo or with TAZRIM_AUTH=off', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '1')
    expect((await mw.middleware(req('/settings'))).status).toBe(200)
    vi.unstubAllEnvs()
    vi.stubEnv('TAZRIM_AUTH', 'off')
    expect((await mw.middleware(req('/api/summary'))).status).toBe(200)
  })
})
