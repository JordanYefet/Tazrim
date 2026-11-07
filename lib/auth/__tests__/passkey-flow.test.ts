/**
 * The whole passkey flow through the routes (ENG-89), with a software
 * authenticator (ES256, "none" attestation) in place of Face ID / Touch ID:
 * first-run setup, sign-in, an invite for a second person, revoking a device,
 * the recovery code, passwords, and confirming "delete all data".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { isoCBOR } from '@simplewebauthn/server/helpers'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

const ORIGIN = 'https://tazrim.home.arpa'
const HEADERS = { host: 'localhost:3000', 'x-forwarded-host': 'tazrim.home.arpa', 'x-forwarded-proto': 'https' }

let db: TestDb
let cookieJar = ''
const cookieStore = { get: (name: string) => (cookieJar && name === 'tazrim_session' ? { value: cookieJar } : undefined) }

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url')
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest()

/** A software passkey bound to tazrim.home.arpa */
function authenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const id = Buffer.from(createHash('sha256').update(Math.random().toString()).digest().subarray(0, 16))
  let counter = 0
  const rpHash = sha256(Buffer.from('tazrim.home.arpa'))
  const jwk = (publicKey as KeyObject).export({ format: 'jwk' })
  const cose = new Map<number, unknown>([
    [1, 2], [3, -7], [-1, 1],
    [-2, Buffer.from(jwk.x!, 'base64url')],
    [-3, Buffer.from(jwk.y!, 'base64url')],
  ])
  const clientData = (type: string, challenge: string) => Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }))
  const flags = (attested: boolean) => Buffer.from([0x01 | 0x04 | (attested ? 0x40 : 0)]) // UP, UV, AT
  const count = () => { const b = Buffer.alloc(4); b.writeUInt32BE(++counter); return b }

  return {
    id: b64u(id),
    create(challenge: string) {
      const credLen = Buffer.alloc(2); credLen.writeUInt16BE(id.length)
      const authData = Buffer.concat([rpHash, flags(true), count(), Buffer.alloc(16), credLen, id, Buffer.from(isoCBOR.encode(cose as never))])
      const att = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]) as never)
      return {
        id: b64u(id), rawId: b64u(id), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: b64u(clientData('webauthn.create', challenge)), attestationObject: b64u(att), transports: ['internal'] },
      }
    },
    get(challenge: string) {
      const authData = Buffer.concat([rpHash, flags(false), count()])
      const cd = clientData('webauthn.get', challenge)
      const signature = sign('sha256', Buffer.concat([authData, sha256(cd)]), privateKey)
      return {
        id: b64u(id), rawId: b64u(id), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(signature) },
      }
    },
  }
}

async function call(path: string, body?: unknown, method = 'POST', headers: Record<string, string> = HEADERS) {
  const mod = await import(/* @vite-ignore */ `@/app/api${path}/route`)
  const req = new Request(`http://localhost:3000/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const res: Response = await mod[method](req, { params: Promise.resolve({ id: (body as { id?: string })?.id }) })
  const set = res.headers.get('set-cookie')
  const m = set?.match(/tazrim_session=([^;]*)/)
  if (m) cookieJar = m[1]
  return { status: res.status, body: await res.json(), setCookie: set }
}

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  const { vi } = await import('vitest')
  vi.doMock('next/headers', () => ({ cookies: async () => cookieStore, headers: async () => new Headers() }))
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('passkey flow', () => {
  const owner = authenticator()
  const spouse = authenticator()
  let recovery = ''

  it('first run: the setup code, a passkey, a session cookie and a recovery code', async () => {
    const { setupCode } = await import('../household')
    const code = setupCode()
    const opts = await call('/auth/register/options', { mode: 'setup', code, name: 'Owner' })
    expect(opts.status).toBe(200)
    expect(opts.body.options.rp.id).toBe('tazrim.home.arpa')
    const done = await call('/auth/register', { flowId: opts.body.flowId, response: owner.create(opts.body.options.challenge), label: 'Mac' })
    expect(done.status).toBe(200)
    expect(done.body.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
    recovery = done.body.recoveryCode
    expect(done.setCookie).toMatch(/HttpOnly/i)
    expect(done.setCookie).toMatch(/Secure/i)
    expect(done.setCookie).not.toMatch(/Max-Age|Expires/i)
    // Setup is closed now
    expect((await call('/auth/register/options', { mode: 'setup', code, name: 'X' })).status).toBe(409)
  })

  it('signs in with the passkey; a challenge works once', async () => {
    cookieJar = ''
    const opts = await call('/auth/options', {})
    const answer = owner.get(opts.body.options.challenge)
    const ok = await call('/auth/login', { flowId: opts.body.flowId, response: answer })
    expect(ok.status).toBe(200)
    expect(cookieJar).not.toBe('')
    expect((await call('/auth/login', { flowId: opts.body.flowId, response: answer })).status).toBe(400)
  })

  it('an invite registers the spouse once, who can then sign in', async () => {
    const inv = await call('/people/invites', { personId: null })
    const token = inv.body.url.split('/invite/')[1]
    expect(inv.body.url.startsWith(`${ORIGIN}/invite/`)).toBe(true)
    cookieJar = ''
    const opts = await call('/auth/register/options', { mode: 'invite', token, name: 'Spouse' })
    const done = await call('/auth/register', { flowId: opts.body.flowId, response: spouse.create(opts.body.options.challenge), label: 'iPhone' })
    expect(done.status).toBe(200)
    expect((await call('/auth/register/options', { mode: 'invite', token, name: 'Again' })).status).toBe(410)
    const login = await call('/auth/options', {})
    expect((await call('/auth/login', { flowId: login.body.flowId, response: spouse.get(login.body.options.challenge) })).status).toBe(200)
  })

  it("a revoked device can't sign in again", async () => {
    const people = await call('/people', undefined, 'GET')
    const iphone = people.body.people.flatMap((p: { passkeys: { id: string; label: string }[] }) => p.passkeys).find((d: { label: string }) => d.label === 'iPhone')
    expect((await call('/people/passkeys/[id]', { id: iphone.id }, 'DELETE')).status).toBe(200)
    const login = await call('/auth/options', {})
    expect((await call('/auth/login', { flowId: login.body.flowId, response: spouse.get(login.body.options.challenge) })).status).toBe(401)
  })

  it('the recovery code signs in once', async () => {
    cookieJar = ''
    expect((await call('/auth/recover', { code: recovery })).status).toBe(200)
    expect(cookieJar).not.toBe('')
    expect((await call('/auth/recover', { code: recovery })).status).toBe(401)
  })
})

describe('passwords', () => {
  const owner = authenticator()
  const PASSWORD = 'correct horse battery'

  it('the owner (signed in with a passkey) sets a password; too short is refused', async () => {
    const { prisma } = await import('@/lib/db/client')
    // A fresh household member with a passkey, signed in through an invite
    const inv = await call('/people/invites', { personId: null })
    const token = inv.body.url.split('/invite/')[1]
    cookieJar = ''
    const opts = await call('/auth/register/options', { mode: 'invite', token, name: 'Partner' })
    expect((await call('/auth/register', { flowId: opts.body.flowId, response: owner.create(opts.body.options.challenge), label: 'Mac' })).status).toBe(200)

    expect((await call('/people/password', { password: 'short' }, 'PUT')).body.code).toBe('WEAK_PASSWORD')
    expect((await call('/people/password', { password: PASSWORD }, 'PUT')).status).toBe(200)
    const people = await call('/people', undefined, 'GET')
    const me = people.body.people.find((p: { id: string }) => p.id === people.body.me)
    expect(me).toMatchObject({ name: 'Partner', hasPassword: true })
    expect(JSON.stringify(people.body)).not.toContain('scrypt')
    const stored = await prisma.person.findFirst({ where: { name: 'Partner' } })
    expect(stored?.passwordHash).toMatch(/^scrypt\$32768\$8\$1\$/)
  })

  it('signs in with name and password (any case, extra spaces); a wrong one or unknown name is 401', async () => {
    cookieJar = ''
    expect((await call('/auth/password', { name: 'Partner', password: 'wrong password!' })).status).toBe(401)
    expect((await call('/auth/password', { name: 'Nobody', password: PASSWORD })).status).toBe(401)
    expect(cookieJar).toBe('')
    const ok = await call('/auth/password', { name: '  partner ', password: PASSWORD })
    expect(ok.status).toBe(200)
    expect(ok.setCookie).toMatch(/HttpOnly/i)
    expect(cookieJar).not.toBe('')
  })

  it('never over plain http from another device; localhost is fine', async () => {
    cookieJar = ''
    const lan = { host: '192.168.1.20:3000' }
    expect((await call('/auth/password', { name: 'Partner', password: PASSWORD }, 'POST', lan)).body.code).toBe('INSECURE')
    expect((await call('/auth/password', { name: 'Partner', password: PASSWORD }, 'POST', { host: 'localhost:3000' })).status).toBe(200)
  })

  it('a new password ends the other password sign-ins, not this one', async () => {
    const { prisma } = await import('@/lib/db/client')
    const partner = await prisma.person.findFirstOrThrow({ where: { name: 'Partner' } })
    const passwordSessions = () => prisma.session.count({ where: { personId: partner.id, passkeyId: null } })
    cookieJar = ''
    await call('/auth/password', { name: 'Partner', password: PASSWORD })
    await call('/auth/password', { name: 'Partner', password: PASSWORD })
    expect(await passwordSessions()).toBeGreaterThanOrEqual(2)
    expect((await call('/people/password', { password: `${PASSWORD} 2` }, 'PUT')).status).toBe(200)
    expect(await passwordSessions()).toBe(1)
    expect((await call('/auth/password', { name: 'Partner', password: PASSWORD })).status).toBe(401)
    expect((await call('/auth/password', { name: 'Partner', password: `${PASSWORD} 2` })).status).toBe(200)
  })

  it('removing the password', async () => {
    expect((await call('/people/password', undefined, 'DELETE')).status).toBe(200)
    cookieJar = ''
    expect((await call('/auth/password', { name: 'Partner', password: `${PASSWORD} 2` })).status).toBe(401)
  })
})

describe('confirming "delete all data" (ENG-89)', () => {
  const me = authenticator()
  const PASSWORD = 'another long password'
  const PHRASE = 'מחק הכל'

  it('needs the signed-in person to confirm: their passkey, or their password', async () => {
    const inv = await call('/people/invites', { personId: null })
    const token = inv.body.url.split('/invite/')[1]
    cookieJar = ''
    const reg = await call('/auth/register/options', { mode: 'invite', token, name: 'Deleter' })
    expect((await call('/auth/register', { flowId: reg.body.flowId, response: me.create(reg.body.options.challenge), label: 'Mac' })).status).toBe(200)

    // The phrase alone, a sign-in challenge, or a wrong password: refused, nothing deleted
    expect((await call('/data/delete-all', { confirm: PHRASE })).body.code).toBe('NOT_CONFIRMED')
    const login = await call('/auth/options', {})
    expect((await call('/data/delete-all', { confirm: PHRASE, flowId: login.body.flowId, response: me.get(login.body.options.challenge) })).status).toBe(403)
    expect((await call('/data/delete-all', { confirm: PHRASE, password: 'not my password' })).status).toBe(403)

    // Their own passkey, for this challenge only
    const opts = await call('/data/delete-all/options', {})
    expect(opts.body.passkey.options.allowCredentials.map((c: { id: string }) => c.id)).toEqual([me.id])
    const answer = me.get(opts.body.passkey.options.challenge)
    expect((await call('/data/delete-all', { confirm: PHRASE, flowId: opts.body.passkey.flowId, response: answer })).status).toBe(200)
    expect((await call('/data/delete-all', { confirm: PHRASE, flowId: opts.body.passkey.flowId, response: answer })).status).toBe(403)

    // Or their password
    expect((await call('/people/password', { password: PASSWORD }, 'PUT')).status).toBe(200)
    expect((await call('/data/delete-all', { confirm: PHRASE, password: PASSWORD })).status).toBe(200)
  })

  it('signed out: 401', async () => {
    cookieJar = ''
    expect((await call('/data/delete-all', { confirm: PHRASE, password: PASSWORD })).status).toBe(401)
  })
})
