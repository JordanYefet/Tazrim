/** The approver registration routes by source (ENG-139): sign-in passkey and password adopted, the old ways unchanged. Fake values only. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRateLimits } from '@/lib/auth/rate-limit'
import { resetHelperCache } from '@/lib/updates/helper'

const mocks = vi.hoisted(() => ({
  session: null as null | { personId: string; personName: string },
  keys: [] as { id: string; label: string; publicKey: string; alg: number }[],
  hasPassword: true,
  password: 'fake-signin-password-1',
  checked: [] as string[],
}))

vi.mock('@/lib/auth/http', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/auth/http')>()), currentSession: async () => mocks.session,
  // Who may call it (admins only, ENG-140) is tested in lib/auth/__tests__/roles-routes.test.ts
  adminRefusal: async () => null,
}))
vi.mock('@/lib/auth/household', () => ({
  hasOwnPassword: async () => mocks.hasPassword,
  checkOwnPassword: async (_id: string, pw: string) => {
    mocks.checked.push(pw)
    return pw === mocks.password
  },
}))
vi.mock('@/lib/egress/signin-keys', () => ({ signinKeysFor: async () => mocks.keys }))
vi.mock('@/lib/db/client', () => ({
  prisma: { setting: { findMany: async () => [] }, passkey: { findFirst: async ({ where }: { where: { credentialId: string } }) => (where.credentialId === 'cred-a' ? { label: 'iPhone' } : null) } },
}))

let dir: string
const post = (route: string, body: unknown) =>
  new Request(`http://localhost:3000/api/egress/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:3000' }, body: JSON.stringify(body) })

function helper(answers: Record<string, { status: number; json: unknown }>) {
  const calls: { route: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const route = new URL(url).pathname
      calls.push({ route, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const a = answers[route] ?? { status: 404, json: {} }
      return Promise.resolve(new Response(JSON.stringify(a.json), { status: a.status }))
    })
  )
  return calls
}
const HEALTH = { '/v1/health': { status: 200, json: { ok: true, api: 2, launcherVersion: '1.30.0' } } }
const BEGIN = '/v1/jobs/egress-register-begin'
const FINISH = '/v1/jobs/egress-register-finish'
const begun = { status: 200, json: { options: { challenge: 'c' }, mode: 'adopt', codeFile: 'tazrim-approval-code.txt', expiresAt: 'soon', secret: 'LEAK' } }
const finished = { status: 200, json: { ok: true, approver: { id: 'a', name: 'n', rpId: 'localhost', createdAt: 'x', kind: 'passkey' } } }

beforeEach(() => {
  resetHelperCache()
  resetRateLimits()
  mocks.session = { personId: 'p1', personName: 'Dana' }
  mocks.keys = [
    { id: 'cred-a', label: 'iPhone', publicKey: 'AAAA', alg: -7 },
    { id: 'cred-b', label: 'Mac', publicKey: 'BBBB', alg: -8 },
  ]
  mocks.hasPassword = true
  mocks.checked = []
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-register-'))
  process.env.TAZRIM_DATABASE_URL = `file:${path.join(dir, 'x.db')}`
  fs.writeFileSync(path.join(dir, '.updater-token'), 'e'.repeat(64))
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TAZRIM_DATABASE_URL
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('register/begin', () => {
  it('no source is a new passkey, as older pages sent it', async () => {
    const calls = helper({ ...HEALTH, [BEGIN]: begun })
    const { POST } = await import('../approvers/register/begin/route')
    expect((await POST(post('approvers/register/begin', { name: 'Laptop' }))).status).toBe(200)
    expect(calls.at(-1)!.body).toEqual({ rpId: 'localhost', rpName: 'תזרים', userName: 'Laptop' })
    expect((await POST(post('approvers/register/begin', {}))).status).toBe(400)
    expect((await POST(post('approvers/register/begin', { name: 'x', source: 'elsewhere' }))).status).toBe(400)
  })

  it('signin-passkey offers the person\'s keys to the updater, and only the known fields come back', async () => {
    const calls = helper({ ...HEALTH, [BEGIN]: begun })
    const { POST } = await import('../approvers/register/begin/route')
    const res = await POST(post('approvers/register/begin', { source: 'signin-passkey' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ options: { challenge: 'c' }, mode: 'adopt', codeFile: 'tazrim-approval-code.txt', expiresAt: 'soon' })
    expect(calls.at(-1)!.body).toEqual({
      rpId: 'localhost',
      rpName: 'תזרים',
      userName: 'Dana',
      adopt: [
        { id: 'cred-a', publicKey: 'AAAA', alg: -7 },
        { id: 'cred-b', publicKey: 'BBBB', alg: -8 },
      ],
    })
  })

  it('signin-passkey with no passkey is NO_SIGNIN_PASSKEY and asks nothing of the updater; signed out is 401', async () => {
    const calls = helper({ ...HEALTH, [BEGIN]: begun })
    const { POST } = await import('../approvers/register/begin/route')
    mocks.keys = []
    const none = await POST(post('approvers/register/begin', { source: 'signin-passkey' }))
    expect(none.status).toBe(409)
    expect((await none.json()).code).toBe('NO_SIGNIN_PASSKEY')
    mocks.session = null
    expect((await POST(post('approvers/register/begin', { source: 'signin-passkey' }))).status).toBe(401)
    expect(calls.filter(c => c.route === BEGIN)).toHaveLength(0)
  })

  it('password and signin-password open a code without any key list', async () => {
    const calls = helper({ ...HEALTH, [BEGIN]: { status: 200, json: { options: {}, mode: 'create', codeFile: 'f', expiresAt: 'x' } } })
    const { POST } = await import('../approvers/register/begin/route')
    expect((await POST(post('approvers/register/begin', { source: 'password' }))).status).toBe(200)
    expect(calls.at(-1)!.body).toMatchObject({ userName: 'סיסמת אישור' })
    expect((await POST(post('approvers/register/begin', { source: 'signin-password' }))).status).toBe(200)
    expect(calls.at(-1)!.body).toEqual({ rpId: 'localhost', rpName: 'תזרים', userName: 'Dana' })
    mocks.hasPassword = false
    const none = await POST(post('approvers/register/begin', { source: 'signin-password' }))
    expect(none.status).toBe(409)
    expect((await none.json()).code).toBe('NO_SIGNIN_PASSWORD')
  })
})

describe('register/finish', () => {
  it('an assertion is relayed with the name taken from the passkey label and the person', async () => {
    const calls = helper({ ...HEALTH, [FINISH]: finished })
    const { POST } = await import('../approvers/register/finish/route')
    const assertion = { id: 'cred-a', response: { signature: 'S' } }
    expect((await POST(post('approvers/register/finish', { code: '123456', assertion }))).status).toBe(200)
    expect(calls.at(-1)!.body).toEqual({ code: '123456', name: 'iPhone של Dana', assertion })
    await POST(post('approvers/register/finish', { code: '123456', name: ' Mine ', assertion }))
    expect(calls.at(-1)!.body.name).toBe('Mine')
    await POST(post('approvers/register/finish', { code: '123456', assertion: { id: 'unknown' } }))
    expect(calls.at(-1)!.body.name).toBe('Dana')
  })

  it('an assertion needs a signed-in person', async () => {
    const calls = helper({ ...HEALTH, [FINISH]: finished })
    mocks.session = null
    const { POST } = await import('../approvers/register/finish/route')
    expect((await POST(post('approvers/register/finish', { code: '123456', assertion: { id: 'cred-a' } }))).status).toBe(401)
    expect(calls.filter(c => c.route === FINISH)).toHaveLength(0)
  })

  it('the sign-in password is relayed once it is right, named for the person', async () => {
    const calls = helper({ ...HEALTH, [FINISH]: finished })
    const { POST } = await import('../approvers/register/finish/route')
    const res = await POST(post('approvers/register/finish', { code: '123456', source: 'signin-password', password: mocks.password }))
    expect(res.status).toBe(200)
    expect(calls.at(-1)!.body).toEqual({ code: '123456', name: 'Dana', password: mocks.password })
  })

  it('a wrong sign-in password is 403 BAD_PASSWORD and is never relayed, so the code keeps its tries', async () => {
    const calls = helper({ ...HEALTH, [FINISH]: finished })
    const { POST } = await import('../approvers/register/finish/route')
    const res = await POST(post('approvers/register/finish', { code: '123456', source: 'signin-password', password: 'not-the-password' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('BAD_PASSWORD')
    expect(body.error).toMatch(/[א-ת]/)
    expect(calls.filter(c => c.route === FINISH)).toHaveLength(0)
  })

  it('the sign-in password is rate limited: ten tries in 15 minutes, right or wrong', async () => {
    const calls = helper({ ...HEALTH, [FINISH]: finished })
    const { POST } = await import('../approvers/register/finish/route')
    for (let i = 0; i < 10; i++) expect((await POST(post('approvers/register/finish', { code: '123456', source: 'signin-password', password: 'wrong' }))).status).toBe(403)
    const res = await POST(post('approvers/register/finish', { code: '123456', source: 'signin-password', password: mocks.password }))
    expect(res.status).toBe(429)
    expect(calls.filter(c => c.route === FINISH)).toHaveLength(0)
  })

  it('a new password and a new passkey go through as before', async () => {
    const calls = helper({ ...HEALTH, [FINISH]: finished })
    const { POST } = await import('../approvers/register/finish/route')
    await POST(post('approvers/register/finish', { code: '123456', name: 'Pw', password: 'another long password' }))
    expect(calls.at(-1)!.body).toEqual({ code: '123456', name: 'Pw', password: 'another long password' })
    expect(mocks.checked).toEqual([])
    await POST(post('approvers/register/finish', { code: '123456', name: 'Key', response: { id: 'x' } }))
    expect(calls.at(-1)!.body).toEqual({ code: '123456', name: 'Key', response: { id: 'x' } })
    expect((await POST(post('approvers/register/finish', { code: '123456', response: { id: 'x' } }))).status).toBe(400)
  })
})

describe('GET approvers/signin', () => {
  it('counts and credential ids only', async () => {
    const { GET } = await import('../approvers/signin/route')
    const res = await GET(new Request('http://localhost:3000/api/egress/approvers/signin', { headers: { host: 'localhost:3000' } }))
    expect(await res.json()).toEqual({ passkeys: 2, password: true, ids: ['cred-a', 'cred-b'] })
    mocks.session = null
    expect(await (await GET(new Request('http://localhost:3000/api/egress/approvers/signin', { headers: { host: 'localhost:3000' } }))).json()).toEqual({ passkeys: 0, password: false, ids: [] })
  })
})
