/**
 * Who may call what (ENG-140): every admin-only route answers a member 403 ADMIN_ONLY before it
 * does anything, an admin gets past it, and the household's everyday routes stay open to members.
 * Fake values only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

const HEADERS = { host: 'localhost:3000', 'x-forwarded-host': 'tazrim.home.arpa', 'x-forwarded-proto': 'https' }

let db: TestDb
let cookieJar = ''
const ids = { admin: '', member: '', memberPasskey: '', adminPasskey: '' }

async function call(route: string, method: string, body?: unknown, params: Record<string, string> = {}) {
  const mod = await import(/* @vite-ignore */ `@/app/api/${route}/route`)
  const req = new Request(`http://localhost:3000/api/${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...HEADERS },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const res: Response = await mod[method](req, { params: Promise.resolve(params) })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function signInAs(personId: string) {
  const { createSession } = await import('../session')
  cookieJar = await createSession(personId, null)
}

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
    INSERT INTO "Person" ("id","name","createdAt","role","owner") VALUES ('p-admin','Admin',1900000001000,'admin',1);
    INSERT INTO "Person" ("id","name","createdAt","role","owner") VALUES ('p-member','Member',1900000002000,'member',0);
    INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('k-admin','p-admin','cred-admin',X'00','Mac');
    INSERT INTO "Passkey" ("id","personId","credentialId","publicKey","label") VALUES ('k-member','p-member','cred-member',X'00','iPhone');
  `)
  usePrismaOn(db)
  Object.assign(ids, { admin: 'p-admin', member: 'p-member', adminPasskey: 'k-admin', memberPasskey: 'k-member' })
  vi.doMock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => (cookieJar && n === 'tazrim_session' ? { value: cookieJar } : undefined) }), headers: async () => new Headers() }))
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})
beforeEach(async () => {
  ;(await import('../rate-limit')).resetRateLimits()
})

/** Every route that is for admins only, with a call that would do something real */
const ADMIN_ONLY: [string, string, unknown?, Record<string, string>?][] = [
  ['people/recovery', 'POST'],
  ['people/invites', 'POST', { personId: null }],
  ['people/invites', 'POST', { personId: 'p-admin' }],
  ['people/passkeys/[id]', 'DELETE', undefined, { id: 'k-admin' }],
  ['people/[id]', 'PUT', { role: 'admin' }, { id: 'p-member' }],
  ['people/[id]', 'DELETE', undefined, { id: 'p-admin' }],
  ['updates/auto', 'PUT', { on: true }],
  ['updates/check', 'POST'],
  ['updates/plan', 'POST', { version: '9.9.9' }],
  ['updates/start', 'POST', { version: '9.9.9' }],
  ['updates/rollback', 'POST'],
  ['install', 'GET'],
  ['install', 'POST', { changes: {} }],
  ['install/network', 'GET'],
  ['settings/app', 'PUT', { name: 'timeZone', value: 'Asia/Jerusalem' }],
  ['egress/on', 'POST'],
  ['egress/approve/begin', 'POST', { change: {} }],
  ['egress/approve/finish', 'POST', {}],
  ['egress/approvers/register/begin', 'POST', { source: 'signin-passkey' }],
  ['egress/approvers/register/finish', 'POST', { code: 'x' }],
  ['data/delete-all/options', 'POST'],
  ['data/delete-all', 'POST', { confirm: 'x' }],
  ['vault/reset', 'POST'],
  ['vault/recovery-key', 'POST'],
]

describe('a member', () => {
  it.each(ADMIN_ONLY)('is refused %s %s with ADMIN_ONLY, and nothing changes', async (route, method, body, params) => {
    await signInAs(ids.member)
    const res = await call(route, method, body, params)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('ADMIN_ONLY')
    expect(db.query(`SELECT COUNT(*) AS n FROM "Person"`)).toEqual([{ n: 2 }])
    expect(db.query(`SELECT "role" FROM "Person" WHERE "id" = 'p-member'`)).toEqual([{ role: 'member' }])
    expect(db.query(`SELECT COUNT(*) AS n FROM "Passkey"`)).toEqual([{ n: 2 }])
    expect(db.query(`SELECT COUNT(*) AS n FROM "Setting"`)).toEqual([{ n: 0 }])
  })

  it('may still do the household everyday things and their own sign-in', async () => {
    await signInAs(ids.member)
    const people = await call('people', 'GET')
    expect(people.status).toBe(200)
    expect(people.body.myRole).toBe('member')
    expect(people.body.people.map((p: { name: string; role: string; owner: boolean }) => [p.name, p.role, p.owner])).toEqual([['Admin', 'admin', true], ['Member', 'member', false]])
    expect((await call('vault', 'GET')).status).toBe(200)
    expect((await call('vault/lock', 'POST')).status).toBe(200)
    expect((await call('settings', 'PUT', { cushion: 1000 })).status).toBe(200)
    expect((await call('people/devices', 'POST', {})).status).toBe(200)
    // Their own: another device for themself, a password, their own device revoked (they have no password yet, so the last-key rule applies to the household, not to them)
    expect((await call('people/invites', 'POST', { personId: ids.member })).status).toBe(200)
    expect((await call('people/password', 'PUT', { password: 'a fake member password' })).status).toBe(200)
    expect((await call('people/passkeys/[id]', 'DELETE', undefined, { id: ids.memberPasskey })).status).toBe(200)
  })

  it('cannot make themself an admin, nor read what is for admins', async () => {
    await signInAs(ids.member)
    expect((await call('people/[id]', 'PUT', { role: 'admin' }, { id: ids.member })).status).toBe(403)
    expect((await call('install', 'GET')).status).toBe(403)
  })
})

describe('signed out', () => {
  it('an admin-only route answers 401, not a level it does not know', async () => {
    cookieJar = ''
    expect((await call('updates/check', 'POST')).status).toBe(401)
  })
})

describe('an admin', () => {
  it('passes the check (what comes next is the route\'s own business)', async () => {
    await signInAs(ids.admin)
    for (const [route, method, body, params] of ADMIN_ONLY.filter(([r]) => r === 'people/invites' || r === 'people/recovery' || r === 'vault/recovery-key' || r === 'updates/auto')) {
      const res = await call(route, method, body, params)
      expect(res.body.code, `${method} ${route}`).not.toBe('ADMIN_ONLY')
    }
  })

  it('sets another person\'s level, and the owner stays locked', async () => {
    await signInAs(ids.admin)
    expect((await call('people/[id]', 'PUT', { role: 'admin' }, { id: ids.member })).body).toMatchObject({ ok: true, role: 'admin' })
    expect((await call('people/[id]', 'PUT', { role: 'nonsense' }, { id: ids.member })).body.code).toBe('BAD_ROLE')
    expect((await call('people/[id]', 'PUT', { role: 'member' }, { id: ids.member })).status).toBe(200)
    const lowered = await call('people/[id]', 'PUT', { role: 'member' }, { id: ids.admin })
    expect(lowered.status).toBe(409)
    expect(lowered.body.code).toBe('OWNER_LOCKED')
    const removed = await call('people/[id]', 'DELETE', undefined, { id: ids.admin })
    expect(removed.body.code).toBe('OWNER_LOCKED')
    expect(db.query(`SELECT "role","owner" FROM "Person" WHERE "id" = 'p-admin'`)).toEqual([{ role: 'admin', owner: 1 }])
  })

  it('invites a person, and a promoted member can then do admin things at once', async () => {
    await signInAs(ids.admin)
    expect((await call('people/invites', 'POST', { personId: null })).status).toBe(200)
    await call('people/[id]', 'PUT', { role: 'admin' }, { id: ids.member })
    await signInAs(ids.member)
    expect((await call('people/invites', 'POST', { personId: null })).status).toBe(200)
    await call('people/[id]', 'PUT', { role: 'member' }, { id: ids.member })
    expect((await call('people/invites', 'POST', { personId: null })).status).toBe(403)
  })
})

describe('with the login off (development on demo data)', () => {
  it('everything is allowed as before', async () => {
    vi.stubEnv('TAZRIM_AUTH', 'off')
    try {
      cookieJar = ''
      const res = await call('people/recovery', 'POST')
      expect(res.status).toBe(200)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
