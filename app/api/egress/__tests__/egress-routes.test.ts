import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entriesAfter, resetLog } from '@/lib/log/buffer'
import { isSensitiveRoute, logged } from '@/lib/log/route'
import { resetHelperCache } from '@/lib/updates/helper'

// These test what each route does; who may call it (admins only, ENG-140) is tested in lib/auth/__tests__/roles-routes.test.ts
const mocks = vi.hoisted(() => ({
  session: null as null | { personId: string; personName: string },
  keys: [] as { id: string; label: string; publicKey: string; alg: number }[],
  hasPassword: false,
  password: 'fake-signin-password-1',
  checked: [] as string[],
}))
vi.mock('@/lib/auth/http', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/auth/http')>()), adminRefusal: async () => null, currentSession: async () => mocks.session }))
vi.mock('@/lib/auth/household', () => ({
  hasOwnPassword: async () => mocks.hasPassword,
  checkOwnPassword: async (_id: string, pw: string) => {
    mocks.checked.push(pw)
    return pw === mocks.password
  },
}))
vi.mock('@/lib/egress/signin-keys', () => ({ signinKeysFor: async () => mocks.keys }))

let dir: string
const post = (route: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000/api/egress/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:3000', ...headers }, body: JSON.stringify(body) })
const get = (headers: Record<string, string> = {}) => new Request('http://localhost:3000/api/egress', { headers: { host: 'localhost:3000', ...headers } })

/** The helper, as a fake: answers by route, remembers what it was sent */
function helper(answers: Record<string, { status: number; json: unknown }>) {
  const calls: { route: string; body: unknown }[] = []
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

beforeEach(() => {
  mocks.session = null
  mocks.keys = []
  mocks.hasPassword = false
  mocks.checked = []
  resetLog()
  resetHelperCache()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-routes-'))
  process.env.TAZRIM_DATABASE_URL = `file:${path.join(dir, 'x.db')}`
  fs.writeFileSync(path.join(dir, '.updater-token'), 'e'.repeat(64))
  process.env.TAZRIM_EGRESS_DIR = path.join(dir, 'egress')
  process.env.TAZRIM_SQUID_LOG = path.join(dir, 'access.log')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  delete process.env.TAZRIM_DATABASE_URL
  delete process.env.TAZRIM_EGRESS_DIR
  delete process.env.TAZRIM_SQUID_LOG
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('gating', () => {
  it('hidden (404) in the read-only demo, and nothing is asked of the helper', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '1')
    const calls = helper(HEALTH)
    const { GET } = await import('../route')
    const { POST } = await import('../on/route')
    expect((await GET(get())).status).toBe(404)
    expect((await POST(post('on', {}))).status).toBe(404)
    expect(calls).toHaveLength(0)
  })
  it('403 for a request from another machine when the login is off', async () => {
    vi.stubEnv('TAZRIM_AUTH', 'off')
    const calls = helper(HEALTH)
    const { POST } = await import('../approve/begin/route')
    const res = await POST(post('approve/begin', { change: { action: 'turn-off' } }, { host: 'tazrim.test', 'x-forwarded-for': '203.0.113.9' }))
    expect(res.status).toBe(403)
    expect(calls).toHaveLength(0)
  })
})

describe('GET /api/egress', () => {
  it('without a helper: off, nothing to show, no refusals list', async () => {
    fs.rmSync(path.join(dir, '.updater-token'))
    const { GET } = await import('../route')
    const body = await (await GET(get())).json()
    expect(body).toMatchObject({ helper: 'none', on: false, blocked: null, approvers: [], extraDomains: [] })
  })
  it('isolation on without a helper: the mounted files and the proxy log', async () => {
    vi.stubEnv('TAZRIM_EGRESS', '1')
    fs.rmSync(path.join(dir, '.updater-token'))
    fs.mkdirSync(path.join(dir, 'egress'))
    fs.writeFileSync(path.join(dir, 'egress', 'extra-domains.json'), JSON.stringify([{ domain: '.shop.example.test', note: '', addedAt: '2030-01-01', approver: 'Phone' }]))
    fs.writeFileSync(path.join(dir, 'access.log'), '1790000000.000 5 172.31.1.5 TCP_DENIED/403 10 CONNECT ads.example.test:443 - HIER_NONE/- -\n')
    const { GET } = await import('../route')
    const body = await (await GET(get())).json()
    expect(body.on).toBe(true)
    expect(body.extraDomains).toHaveLength(1)
    expect(body.blocked).toEqual([{ at: 1790000000000, who: 'app', host: 'ads.example.test' }])
  })
  it('an older updater (api 1) is "old": nothing is run in it', async () => {
    const calls = helper({ '/v1/health': { status: 200, json: { ok: true, api: 1, helperVersion: '1.19.0', features: ['config'] } } })
    const { GET } = await import('../route')
    expect(await (await GET(get())).json()).toMatchObject({ helper: 'old', on: false })
    expect(calls.map(c => c.route)).toEqual(['/v1/health'])
  })
  it('the switch job is the settings job from the status file when it says egress', async () => {
    fs.writeFileSync(path.join(dir, '.config-status.json'), JSON.stringify({ id: 'j9', kind: 'config', egress: 'on', state: 'done', restored: false, steps: [{ id: 'write', state: 'done' }], finishedAt: '2030-01-01T00:00:00Z', backup: '.env.bak-x' }))
    helper({ ...HEALTH, '/v1/jobs/egress-info': { status: 200, json: { available: true, on: true, extraDomains: [], approvers: [], changes: [] } } })
    const { GET } = await import('../route')
    const body = await (await GET(get())).json()
    expect(body.job).toEqual({ id: 'j9', state: 'done', restored: false, steps: [{ id: 'write', state: 'done' }], finishedAt: '2030-01-01T00:00:00Z' })
    // a plain settings job is not the isolation switch's
    fs.writeFileSync(path.join(dir, '.config-status.json'), JSON.stringify({ id: 'j8', kind: 'config', state: 'done', restored: false, steps: [] }))
    expect((await (await GET(get())).json()).job).toBeNull()
  })
  it('with the helper: its answer, reduced to known fields', async () => {
    helper({
      ...HEALTH,
      '/v1/jobs/egress-info': { status: 200, json: { available: true, on: true, overrideDiffers: false, extraDomains: [], approvers: [{ id: 'k1', name: 'Phone', rpId: 'tazrim.test', createdAt: '2030-01-01', kind: 'password', publicKey: 'LEAK' }], changes: [], secret: 'LEAK' } },
    })
    const { GET } = await import('../route')
    const body = await (await GET(get())).json()
    expect(body).toMatchObject({ helper: 'ready', on: true })
    expect(JSON.stringify(body)).not.toContain('LEAK')
  })
})

describe('POST relays', () => {
  it('on: the helper token route, 202 with a cut-down job', async () => {
    const calls = helper({ '/v1/jobs/egress-on': { status: 202, json: { job: { id: 'j1', kind: 'config', state: 'running', steps: [{ id: 'write', state: 'running' }], secretPath: '/install/.env' } } } })
    const { POST } = await import('../on/route')
    const res = await POST(post('on', {}))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.job).toMatchObject({ id: 'j1', state: 'running' })
    expect(JSON.stringify(body)).not.toContain('/install')
    expect(calls[0].route).toBe('/v1/jobs/egress-on')
  })
  it('approve/begin passes the change and this request\'s host name as rpId, nothing else', async () => {
    const calls = helper({ '/v1/jobs/egress-approve-begin': { status: 200, json: { options: { challenge: 'c' }, change: { action: 'turn-off' } } } })
    const { POST } = await import('../approve/begin/route')
    const res = await POST(post('approve/begin', { change: { action: 'turn-off', extra: 'x' }, isAdmin: true }, { host: 'tazrim.test:3000' }))
    expect(res.status).toBe(200)
    expect(calls[0].body).toEqual({ change: { action: 'turn-off' }, rpId: 'tazrim.test' })
  })
  it('approve/begin takes an update\'s compose files too (ENG-137): the version and the hashes, cut down to known names', async () => {
    const H = 'c'.repeat(64)
    const calls = helper({ '/v1/jobs/egress-approve-begin': { status: 200, json: { flowId: 'f1', options: null, passwordAllowed: true, change: { action: 'update-compose' } } } })
    const { POST } = await import('../approve/begin/route')
    const res = await POST(post('approve/begin', { change: { action: 'update-compose', version: '1.2.0', files: { 'docker-compose.yml': H }, extra: 1 } }, { host: 'tazrim.test' }))
    expect(res.status).toBe(200)
    expect(calls[0].body).toEqual({ change: { action: 'update-compose', version: '1.2.0', files: { 'docker-compose.yml': H } }, rpId: 'tazrim.test' })
    for (const change of [
      { action: 'update-compose', version: 'latest', files: { 'docker-compose.yml': H } },
      { action: 'update-compose', version: '1.2.0', files: { '.env': H } },
      { action: 'update-compose', version: '1.2.0', files: {} },
      { action: 'update-compose', version: '1.2.0' },
    ]) {
      expect((await POST(post('approve/begin', { change }))).status).toBe(400)
    }
    expect(calls).toHaveLength(1)
  })
  it('a bad change never reaches the helper', async () => {
    const calls = helper({})
    const { POST } = await import('../approve/begin/route')
    for (const change of [{ action: 'format-disk' }, { action: 'add-domain' }, { action: 'remove-approver', id: 5 }, null]) {
      expect((await POST(post('approve/begin', { change }))).status).toBe(400)
    }
    expect(calls).toHaveLength(0)
  })
  it('a refusal becomes its Hebrew line; the helper\'s detail stays behind', async () => {
    helper({ '/v1/jobs/egress-approve-begin': { status: 400, json: { error: 'SHARED_HOST', detail: 'pastebin.example.test is a paste site' } } })
    const { POST } = await import('../approve/begin/route')
    const res = await POST(post('approve/begin', { change: { action: 'add-domain', domain: 'paste.example.test' } }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('SHARED_HOST')
    expect(body.error).toMatch(/[֐-׿]/)
    expect(JSON.stringify(body)).not.toContain('paste site')
  })
  it('no helper: 503 NO_HELPER', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))))
    const { POST } = await import('../approve/finish/route')
    const res = await POST(post('approve/finish', { response: { id: 'x' } }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('NO_HELPER')
  })
  it('register/begin sends rpId, rpName and the key\'s name', async () => {
    const calls = helper({ '/v1/jobs/egress-register-begin': { status: 200, json: { options: {}, codeFile: 'tazrim-approval-code.txt', expiresAt: 'soon' } } })
    const { POST } = await import('../approvers/register/begin/route')
    const res = await POST(post('approvers/register/begin', { name: ' Laptop ' }, { host: 'localhost:3000' }))
    expect(res.status).toBe(200)
    expect(calls[0].body).toMatchObject({ rpId: 'localhost', userName: 'Laptop' })
  })
})

describe('the passkey routes log keys only', () => {
  it('approve and register routes are sensitive; the others are not', () => {
    for (const p of ['/api/egress/approve/begin', '/api/egress/approve/finish', '/api/egress/approvers/register/begin', '/api/egress/approvers/register/finish']) {
      expect(isSensitiveRoute(p)).toBe(true)
    }
    expect(isSensitiveRoute('/api/egress')).toBe(false)
    expect(isSensitiveRoute('/api/egress/on')).toBe(false)
  })
  it('a finish call leaves its keys in the log, never the passkey answer or the code', async () => {
    helper({ '/v1/jobs/egress-approve-finish': { status: 200, json: { ok: true } } })
    const { POST } = await import('../approve/finish/route')
    await POST(post('approve/finish', { response: { id: 'CRED-ID-1', response: { signature: 'SIGNATURE-BYTES', clientDataJSON: 'CLIENT-DATA' } } }))
    const { POST: register } = await import('../approvers/register/finish/route')
    await logged(register)(post('approvers/register/finish', { code: '123456', name: 'Phone', response: { id: 'CRED-ID-2' } }))
    await logged(POST)(post('approve/finish', { response: { id: 'CRED-ID-1', response: { signature: 'SIGNATURE-BYTES', clientDataJSON: 'CLIENT-DATA' } } }))
    const dump = JSON.stringify(entriesAfter())
    expect(dump).toContain('approve/finish')
    expect(dump).toContain('signature')
    for (const secret of ['CRED-ID-1', 'SIGNATURE-BYTES', 'CLIENT-DATA', '123456', 'CRED-ID-2']) expect(dump).not.toContain(secret)
  })
  it('a password never reaches the log, and reaches the helper as sent', async () => {
    const calls = helper({
      '/v1/jobs/egress-approve-finish': { status: 200, json: { ok: true } },
      '/v1/jobs/egress-register-finish': { status: 200, json: { ok: true, approver: { id: 'p', name: 'Pw', rpId: '', createdAt: 'x', kind: 'password', hash: 'LEAK' } } },
    })
    const { POST: finish } = await import('../approve/finish/route')
    const { POST: register } = await import('../approvers/register/finish/route')
    expect((await logged(finish)(post('approve/finish', { flowId: 'flow-1', password: 'correct horse battery' }))).status).toBe(200)
    const res = await logged(register)(post('approvers/register/finish', { code: '654321', name: 'Pw', password: 'correct horse battery' }))
    expect(JSON.stringify(await res.json())).not.toContain('LEAK')
    expect(calls.map(c => c.body)).toEqual([{ flowId: 'flow-1', password: 'correct horse battery' }, { code: '654321', name: 'Pw', password: 'correct horse battery' }])
    const dump = JSON.stringify(entriesAfter())
    expect(dump).toContain('password')
    for (const secret of ['correct horse battery', '654321', 'flow-1']) expect(dump).not.toContain(secret)
  })
  it('a wrong password and a lockout come back as their Hebrew lines', async () => {
    helper({ '/v1/jobs/egress-approve-finish': { status: 403, json: { error: 'LOCKED', until: '2030-01-01T00:15:00Z', detail: 'x' } } })
    const { POST } = await import('../approve/finish/route')
    const res = await POST(post('approve/finish', { flowId: 'f', password: 'wrong' }))
    const body = await res.json()
    expect(body).toMatchObject({ code: 'LOCKED', until: '2030-01-01T00:15:00Z' })
    expect(body.error).toMatch(/[֐-׿]/)
  })
  it('begin forwards flowId, options and passwordAllowed', async () => {
    helper({ '/v1/jobs/egress-approve-begin': { status: 200, json: { flowId: 'f1', options: null, passwordAllowed: true, change: { action: 'turn-off' }, junk: 1 } } })
    const { POST } = await import('../approve/begin/route')
    const body = await (await POST(post('approve/begin', { change: { action: 'turn-off' } }))).json()
    expect(body).toEqual({ flowId: 'f1', options: null, passwordAllowed: true, change: { action: 'turn-off' } })
  })
})

describe('approve/begin and finish: the first approval and add-approver (ENG-141)', () => {
  const BEGIN = '/v1/jobs/egress-approve-begin'
  const FINISH = '/v1/jobs/egress-approve-finish'
  const KEYS = [
    { id: 'cred-a', label: 'iPhone', publicKey: 'AAAA', alg: -7 },
    { id: 'cred-b', label: 'Mac', publicKey: 'BBBB', alg: -8 },
  ]
  beforeEach(() => {
    mocks.session = { personId: 'p1', personName: 'Dana' }
    mocks.keys = KEYS
    mocks.hasPassword = true
  })

  it('begin sends the signed-in admin\'s keys (named person · device), whether they have a password, and their name', async () => {
    const calls = helper({ [BEGIN]: { status: 200, json: { flowId: 'f', options: {}, passwordAllowed: true, bootstrap: true, change: { action: 'turn-off' }, junk: 1 } } })
    const { POST } = await import('../approve/begin/route')
    const res = await POST(post('approve/begin', { change: { action: 'turn-off' } }))
    expect(await res.json()).toEqual({ flowId: 'f', options: {}, passwordAllowed: true, bootstrap: true, change: { action: 'turn-off' } })
    expect(calls[0].body).toEqual({
      change: { action: 'turn-off' },
      rpId: 'localhost',
      adopt: [
        { id: 'cred-a', publicKey: 'AAAA', alg: -7, name: 'Dana · iPhone' },
        { id: 'cred-b', publicKey: 'BBBB', alg: -8, name: 'Dana · Mac' },
      ],
      adoptPassword: true,
      userName: 'Dana',
    })
  })

  it('without a session or keys nothing is offered', async () => {
    const calls = helper({ [BEGIN]: { status: 200, json: { flowId: 'f' } } })
    const { POST } = await import('../approve/begin/route')
    mocks.session = null
    await POST(post('approve/begin', { change: { action: 'turn-off' } }))
    mocks.session = { personId: 'p1', personName: 'Dana' }
    mocks.keys = []
    mocks.hasPassword = false
    await POST(post('approve/begin', { change: { action: 'turn-off' } }))
    expect(calls[0].body).toEqual({ change: { action: 'turn-off' }, rpId: 'localhost' })
    expect(calls[1].body).toEqual({ change: { action: 'turn-off' }, rpId: 'localhost', adoptPassword: false, userName: 'Dana' })
  })

  it('add-approver sends the plain change plus only the kind being added', async () => {
    const calls = helper({ [BEGIN]: { status: 200, json: { flowId: 'f' } } })
    const { POST } = await import('../approve/begin/route')
    await POST(post('approve/begin', { change: { action: 'add-approver', kind: 'passkey' } }))
    await POST(post('approve/begin', { change: { action: 'add-approver', kind: 'password' } }))
    expect(calls[0].body).toMatchObject({ change: { action: 'add-approver' }, adoptPassword: false, adopt: [{ id: 'cred-a' }, { id: 'cred-b' }] })
    expect(calls[1].body).toMatchObject({ change: { action: 'add-approver' }, adoptPassword: true })
    expect(calls[1].body).not.toHaveProperty('adopt')
    for (const change of [{ action: 'add-approver' }, { action: 'add-approver', kind: 'both' }]) expect((await POST(post('approve/begin', { change }))).status).toBe(400)
    expect(calls).toHaveLength(2)
  })

  it('add-approver for a kind the person does not have is refused before the helper', async () => {
    const calls = helper({ [BEGIN]: { status: 200, json: {} } })
    const { POST } = await import('../approve/begin/route')
    mocks.keys = []
    expect((await POST(post('approve/begin', { change: { action: 'add-approver', kind: 'passkey' } }))).status).toBe(409)
    mocks.hasPassword = false
    expect((await POST(post('approve/begin', { change: { action: 'add-approver', kind: 'password' } }))).status).toBe(409)
    expect(calls).toHaveLength(0)
  })

  it('finish with { signin } checks the sign-in password first: a wrong one is not relayed, the right one is', async () => {
    const calls = helper({ [FINISH]: { status: 200, json: { ok: true, adoptToken: 'tok', adoptOptions: { challenge: 'c' }, junk: 1 } } })
    const { POST } = await import('../approve/finish/route')
    const wrong = await POST(post('approve/finish', { flowId: 'f1', password: 'not it', signin: true }))
    expect(wrong.status).toBe(403)
    expect((await wrong.json()).code).toBe('BAD_PASSWORD')
    expect(calls).toHaveLength(0)
    const right = await POST(post('approve/finish', { flowId: 'f1', password: mocks.password, signin: true }))
    expect(await right.json()).toEqual({ ok: true, adoptToken: 'tok', adoptOptions: { challenge: 'c' } })
    expect(calls[0].body).toEqual({ flowId: 'f1', password: mocks.password })
    expect(mocks.checked).toEqual(['not it', mocks.password])
  })

  it('finish without { signin } relays the password as it is (it is checked against the pinned one in the updater)', async () => {
    const calls = helper({ [FINISH]: { status: 200, json: { ok: true } } })
    const { POST } = await import('../approve/finish/route')
    await POST(post('approve/finish', { flowId: 'f1', password: 'whatever' }))
    expect(calls[0].body).toEqual({ flowId: 'f1', password: 'whatever' })
    expect(mocks.checked).toEqual([])
  })

  it('finish with { signin } and no session is 401', async () => {
    helper({ [FINISH]: { status: 200, json: { ok: true } } })
    mocks.session = null
    const { POST } = await import('../approve/finish/route')
    expect((await POST(post('approve/finish', { flowId: 'f1', password: 'x', signin: true }))).status).toBe(401)
  })

  it('the first-approval refusals have their Hebrew lines', async () => {
    helper({ [FINISH]: { status: 409, json: { error: 'BOOTSTRAP_TAKEN', detail: 'x' } } })
    const { POST } = await import('../approve/finish/route')
    const body = await (await POST(post('approve/finish', { response: { id: 'c' } }))).json()
    expect(body.code).toBe('BOOTSTRAP_TAKEN')
    expect(body.error).toMatch(/[֐-׿]/)
  })

  it('register/finish takes a token instead of the code, and passes no code or name with it', async () => {
    const calls = helper({ '/v1/jobs/egress-register-finish': { status: 200, json: { ok: true, approver: { id: 'a', name: 'n', rpId: 'localhost', createdAt: 'x', kind: 'passkey' } } } })
    const { POST } = await import('../approvers/register/finish/route')
    expect((await POST(post('approvers/register/finish', { token: 'tok', assertion: { id: 'cred-a' } }))).status).toBe(200)
    expect(calls[0].body).toEqual({ token: 'tok', assertion: { id: 'cred-a' } })
    expect((await POST(post('approvers/register/finish', { token: 'tok', source: 'signin-password', password: 'wrong' }))).status).toBe(403)
    expect(calls).toHaveLength(1)
    expect((await POST(post('approvers/register/finish', { token: 'tok', source: 'signin-password', password: mocks.password }))).status).toBe(200)
    expect(calls[1].body).toEqual({ token: 'tok', password: mocks.password })
    expect((await POST(post('approvers/register/finish', { token: 'tok', password: 'x', name: 'n' }))).status).toBe(400)
    expect((await POST(post('approvers/register/finish', { name: 'n' }))).status).toBe(400)
  })
})
