import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APPROVAL_TTL_MS, CODE_FILE, CODE_TTL_MS, createEgress, PASSWORD_LOCK_MS, renderExtraTxt } from '../egress.mjs'
import { memLock } from './fakes.mjs'

// Fake values only. Real keys are generated per test run: the code under test verifies real signatures.
const RP = 'tazrim.example'
const ORIGIN = `https://${RP}`
const sha = d => crypto.createHash('sha256').update(d).digest()
const b64u = b => Buffer.from(b).toString('base64url')
const PASSWORD = 'correct horse battery'

function makeKey(kind) {
  if (kind === 'es256') return { alg: -7, ...crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }) }
  if (kind === 'eddsa') return { alg: -8, ...crypto.generateKeyPairSync('ed25519') }
  return { alg: -257, ...crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }) }
}
const spki = k => b64u(k.publicKey.export({ format: 'der', type: 'spki' }))
const authData = (rpId, flags) => Buffer.concat([sha(rpId), Buffer.from([flags]), Buffer.alloc(4)])
const UP_UV = 0x05

function sign(key, data) {
  if (key.alg === -7) return crypto.sign('sha256', data, { key: key.privateKey, dsaEncoding: 'der' })
  if (key.alg === -257) return crypto.sign('sha256', data, key.privateKey)
  return crypto.sign(null, data, key.privateKey)
}

/** A startRegistration() answer built by hand */
function registration(key, { id = 'cred-1', challenge, rpId = RP, origin = ORIGIN, flags = UP_UV, type = 'webauthn.create' }) {
  return {
    id,
    response: {
      clientDataJSON: b64u(JSON.stringify({ type, challenge, origin })),
      authenticatorData: b64u(authData(rpId, flags)),
      publicKey: spki(key),
      publicKeyAlgorithm: key.alg,
    },
  }
}

/** A startAuthentication() answer built by hand and really signed */
function assertion(key, { id = 'cred-1', challenge, rpId = RP, origin = ORIGIN, flags = UP_UV, signer = key, tamper = null }) {
  const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin }))
  const ad = authData(rpId, flags)
  const signature = sign(signer, Buffer.concat([ad, sha(clientData)]))
  const sent = tamper ? Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, ...tamper })) : clientData
  return { id, response: { clientDataJSON: b64u(sent), authenticatorData: b64u(ad), signature: b64u(signature) } }
}

let dir
let clock
let squid // fake squid state
let egress
let restart // a new module instance over the same folder: what a new job container is
let config
let lock

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-egress-'))
  clock = { t: Date.parse('2026-11-21T10:00:00Z') }
  squid = { running: true, exitCode: 0, execs: [] }
  lock = memLock()
  config = {
    started: [],
    async context() {
      return { ctx: { configFiles: ['/h/docker-compose.yml', '/h/docker-compose.egress.yml'] } }
    },
    async startEgress(on) {
      this.started.push(on)
      return { status: 202, job: { id: 'job-1', kind: 'config', egress: on ? 'on' : 'off', state: 'running' }, done: Promise.resolve() }
    },
    current: () => null,
  }
  const docker = {
    async findService(name) {
      expect(name).toBe('squid')
      return squid.running ? 'squid-id' : null
    },
    async exec(id, cmd) {
      squid.execs.push({ id, cmd, txt: fs.readFileSync(path.join(dir, 'egress/extra-domains.txt'), 'utf8') })
      const code = typeof squid.exitCode === 'function' ? squid.exitCode(squid.execs.length) : squid.exitCode
      return { exitCode: code }
    },
  }
  restart = () => createEgress({ config, docker, lock, installDir: dir, now: () => new Date(clock.t), bankDomains: ['.bank-one.example', '.bank-two.example'], overrideSource: path.join(dir, 'missing.yml') })
  egress = restart()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const codeOnDisk = () => fs.readFileSync(path.join(dir, CODE_FILE), 'utf8').trim()
const readJson = f => JSON.parse(fs.readFileSync(f === 'approvers.json' ? path.join(dir, '.tazrim-approvers', f) : path.join(dir, 'egress', f), 'utf8'))
const logLines = () => fs.readFileSync(path.join(dir, 'egress/changes.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))

/** Registers a passkey the way the app would: begin, read the code file, finish */
async function registerPasskey(key, { name = 'My phone', id = 'cred-1' } = {}) {
  const b = await egress.registerBegin({ rpId: RP, rpName: 'Tazrim', userName: 'me' })
  const r = await egress.registerFinish({ code: codeOnDisk(), name, response: registration(key, { id, challenge: b.body.options.challenge }) })
  expect(r.body).toMatchObject({ ok: true })
  return r
}

async function registerPassword(name = 'Home password', password = PASSWORD) {
  await egress.registerBegin({ rpId: RP })
  return egress.registerFinish({ code: codeOnDisk(), name, password })
}

const addDomain = (domain = '.shop.example', note = 'test') => ({ action: 'add-domain', domain, note })
const begin = change => egress.approveBegin({ change, rpId: RP })

describe('registration of a passkey', () => {
  it('begin writes a 6-digit code to a 0600 file next to .env and returns creation options', async () => {
    const r = await egress.registerBegin({ rpId: RP, rpName: 'Tazrim', userName: 'me' })
    expect(r.status).toBe(200)
    expect(r.body.codeFile).toBe('tazrim-approval-code.txt')
    expect(codeOnDisk()).toMatch(/^\d{6}$/)
    expect(fs.statSync(path.join(dir, CODE_FILE)).mode & 0o777).toBe(0o600)
    expect(r.body.options).toMatchObject({
      rp: { id: RP, name: 'Tazrim' },
      user: { name: 'me', displayName: 'me' },
      attestation: 'none',
      timeout: 120000,
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      pubKeyCredParams: [{ alg: -7 }, { alg: -8 }, { alg: -257 }],
      excludeCredentials: [],
    })
    expect(r.body.options.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new Date(r.body.expiresAt).getTime()).toBe(clock.t + CODE_TTL_MS)
    // not inside egress/, which the app mounts
    expect(fs.existsSync(path.join(dir, 'egress', CODE_FILE))).toBe(false)
  })

  for (const kind of ['es256', 'eddsa', 'rs256']) {
    it(`stores a ${kind} approver, deletes the code file and logs it`, async () => {
      const key = makeKey(kind)
      const r = await registerPasskey(key)
      expect(r.body.approver).toMatchObject({ id: 'cred-1', kind: 'passkey', name: 'My phone', rpId: RP })
      expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(false)
      expect(readJson('approvers.json')[0]).toMatchObject({ id: 'cred-1', alg: key.alg, rpId: RP, origin: ORIGIN, publicKey: spki(key) })
      expect(logLines().at(-1)).toMatchObject({ action: 'add-approver', approver: 'My phone' })
    })
  }

  it('finish without begin is refused', async () => {
    const r = await egress.registerFinish({ code: '123456', name: 'x', response: registration(makeKey('es256'), { challenge: 'abc' }) })
    expect(r).toMatchObject({ status: 400, body: { error: 'NO_REGISTRATION' } })
  })

  it('a wrong code is refused, and the 5th wrong try cancels the registration and removes the file', async () => {
    const b = await egress.registerBegin({ rpId: RP })
    const right = codeOnDisk()
    const wrong = right === '000000' ? '111111' : '000000'
    const key = makeKey('es256')
    const resp = registration(key, { challenge: b.body.options.challenge })
    for (let i = 0; i < 4; i++) expect((await egress.registerFinish({ code: wrong, name: 'x', response: resp })).body.error).toBe('BAD_CODE')
    expect((await egress.registerFinish({ code: wrong, name: 'x', response: resp })).body.error).toBe('TOO_MANY_TRIES')
    expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(false)
    // even the right code no longer works: begin again
    expect((await egress.registerFinish({ code: right, name: 'x', response: resp })).body.error).toBe('NO_REGISTRATION')
  })

  it('the code expires after 10 minutes', async () => {
    const b = await egress.registerBegin({ rpId: RP })
    const code = codeOnDisk()
    clock.t += CODE_TTL_MS
    const r = await egress.registerFinish({ code, name: 'x', response: registration(makeKey('es256'), { challenge: b.body.options.challenge }) })
    expect(r.body.error).toBe('NO_REGISTRATION')
    expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(false)
  })

  it('refuses a wrong challenge, origin, rpId hash, missing user verification, or a different kind of key', async () => {
    const key = makeKey('es256')
    const b = await egress.registerBegin({ rpId: RP })
    const challenge = b.body.options.challenge
    const code = codeOnDisk()
    const go = resp => egress.registerFinish({ code, name: 'x', response: resp }).then(r => r.body.error)
    expect(await go(registration(key, { challenge: 'other' }))).toBe('BAD_CHALLENGE')
    expect(await go(registration(key, { challenge, origin: 'https://evil.example' }))).toBe('BAD_ORIGIN')
    expect(await go(registration(key, { challenge, rpId: 'evil.example' }))).toBe('BAD_RPID_HASH')
    expect(await go(registration(key, { challenge, flags: 0x01 }))).toBe('NO_USER_VERIFICATION')
    expect(await go(registration(key, { challenge, flags: 0x04 }))).toBe('NO_USER_PRESENCE')
    expect(await go(registration(key, { challenge, type: 'webauthn.get' }))).toBe('BAD_CLIENT_DATA')
    expect(await go({ ...registration(key, { challenge }), response: { ...registration(key, { challenge }).response, publicKey: 'AAAA' } })).toBe('BAD_KEY')
    // declares ES256 but the key is Ed25519
    expect(await go({ ...registration(makeKey('eddsa'), { challenge }), response: { ...registration(makeKey('eddsa'), { challenge }).response, publicKeyAlgorithm: -7 } })).toBe('BAD_KEY')
    expect(await go({ ...registration(key, { challenge }), response: { ...registration(key, { challenge }).response, publicKeyAlgorithm: -99 } })).toBe('BAD_ALG')
    expect(fs.existsSync(path.join(dir, '.tazrim-approvers/approvers.json'))).toBe(false)
  })

  it('accepts a subdomain origin of the rpId', async () => {
    const b = await egress.registerBegin({ rpId: RP })
    const r = await egress.registerFinish({ code: codeOnDisk(), name: 'x', response: registration(makeKey('es256'), { challenge: b.body.options.challenge, origin: `https://app.${RP}:3443` }) })
    expect(r.body.ok).toBe(true)
  })

  it('excludes the credentials already registered for this rpId on the next begin', async () => {
    await registerPasskey(makeKey('es256'))
    const b = await egress.registerBegin({ rpId: RP })
    expect(b.body.options.excludeCredentials).toEqual([{ type: 'public-key', id: 'cred-1' }])
  })
})

describe('registration of the approval password', () => {
  it('stores a scrypt hash, never the password', async () => {
    const r = await registerPassword()
    expect(r.body).toMatchObject({ ok: true, approver: { kind: 'password', name: 'Home password' } })
    const stored = readJson('approvers.json')[0]
    expect(stored).toMatchObject({ kind: 'password', params: { N: 32768, r: 8, p: 1, keylen: 64 } })
    expect(stored.hash).toBeTruthy()
    expect(stored.salt).toBeTruthy()
    for (const f of ['.tazrim-approvers/approvers.json', 'egress/changes.jsonl']) expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toContain(PASSWORD)
    // the folder the app can read holds no approvers (no password hash to guess at offline)
    expect(fs.readdirSync(path.join(dir, 'egress'))).not.toContain('approvers.json')
    expect(JSON.stringify(r.body)).not.toContain('hash')
    expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(false)
  })

  it('refuses a short password and keeps the pending registration', async () => {
    await egress.registerBegin({ rpId: RP })
    const r = await egress.registerFinish({ code: codeOnDisk(), name: 'x', password: 'short one' })
    expect(r.body.error).toBe('WEAK_PASSWORD')
    expect((await egress.registerFinish({ code: codeOnDisk(), name: 'x', password: PASSWORD })).body.ok).toBe(true)
  })

  it('takes ten characters, the same minimum as signing in', async () => {
    await egress.registerBegin({ rpId: RP })
    expect((await egress.registerFinish({ code: codeOnDisk(), name: 'x', password: 'a'.repeat(9) })).body.error).toBe('WEAK_PASSWORD')
    expect((await egress.registerFinish({ code: codeOnDisk(), name: 'x', password: 'a'.repeat(10) })).body.ok).toBe(true)
  })

  it('refuses a wrong code', async () => {
    await egress.registerBegin({ rpId: RP })
    const code = codeOnDisk()
    const r = await egress.registerFinish({ code: code === '000000' ? '111111' : '000000', name: 'x', password: PASSWORD })
    expect(r.body.error).toBe('BAD_CODE')
  })

  it('registering again replaces the old password (one only) and logs it', async () => {
    await registerPassword('First')
    await registerPassword('Second', 'another long password')
    const list = readJson('approvers.json')
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Second')
    expect(logLines().at(-1)).toMatchObject({ action: 'add-approver', detail: 'Second (password replaced)' })
  })
})

describe('adopting a sign-in passkey (ENG-139)', () => {
  const entry = (key, id = 'signin-1') => ({ id, publicKey: spki(key), alg: key.alg })
  const adoptBegin = list => egress.registerBegin({ rpId: RP, adopt: list })

  it('begin answers with assertion options for the offered credentials, and the code file', async () => {
    const key = makeKey('es256')
    const r = await adoptBegin([entry(key), entry(makeKey('eddsa'), 'signin-2')])
    expect(r.status).toBe(200)
    expect(r.body.mode).toBe('adopt')
    expect(r.body.options).toMatchObject({
      rpId: RP,
      userVerification: 'required',
      timeout: 120000,
      allowCredentials: [
        { type: 'public-key', id: 'signin-1' },
        { type: 'public-key', id: 'signin-2' },
      ],
    })
    expect(r.body.options.rp).toBeUndefined()
    expect(codeOnDisk()).toMatch(/^\d{6}$/)
  })

  for (const kind of ['es256', 'eddsa', 'rs256']) {
    it(`finish stores the adopted ${kind} key with the origin of the assertion, and logs it`, async () => {
      const key = makeKey(kind)
      const b = await adoptBegin([entry(key)])
      const r = await egress.registerFinish({ code: codeOnDisk(), name: 'iPhone של דנה', assertion: assertion(key, { id: 'signin-1', challenge: b.body.options.challenge, origin: `https://app.${RP}:3443` }) })
      expect(r.body.approver).toMatchObject({ id: 'signin-1', kind: 'passkey', name: 'iPhone של דנה', rpId: RP })
      const stored = readJson('approvers.json')[0]
      expect(stored).toMatchObject({ id: 'signin-1', publicKey: spki(key), alg: key.alg, rpId: RP, origin: `https://app.${RP}:3443`, adopted: true })
      expect(logLines().at(-1)).toMatchObject({ action: 'add-approver', detail: 'iPhone של דנה' })
      expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(false)
    })
  }

  it('an adopted key then approves a change like any other', async () => {
    const key = makeKey('es256')
    const b = await adoptBegin([entry(key)])
    await egress.registerFinish({ code: codeOnDisk(), name: 'Phone', assertion: assertion(key, { id: 'signin-1', challenge: b.body.options.challenge }) })
    const ab = await begin(addDomain())
    const r = await egress.approveFinish({ flowId: ab.body.flowId, response: assertion(key, { id: 'signin-1', challenge: ab.body.options.challenge }) })
    expect(r.body.ok).toBe(true)
  })

  it('adopting a key already registered replaces it', async () => {
    const key = makeKey('es256')
    await registerPasskey(key, { id: 'signin-1', name: 'Old' })
    const b = await adoptBegin([entry(key)])
    await egress.registerFinish({ code: codeOnDisk(), name: 'New', assertion: assertion(key, { id: 'signin-1', challenge: b.body.options.challenge }) })
    const list = readJson('approvers.json')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'New', adopted: true })
  })

  it('a credential that was not offered is NOT_FOUND', async () => {
    const key = makeKey('es256')
    const b = await adoptBegin([entry(key)])
    const r = await egress.registerFinish({ code: codeOnDisk(), name: 'x', assertion: assertion(key, { id: 'other-credential', challenge: b.body.options.challenge }) })
    expect(r.body.error).toBe('NOT_FOUND')
    expect(fs.existsSync(path.join(dir, '.tazrim-approvers', 'approvers.json'))).toBe(false)
  })

  it('a signature by another key, or over another challenge, is refused and nothing is stored', async () => {
    const key = makeKey('es256')
    const b = await adoptBegin([entry(key)])
    const go = a => egress.registerFinish({ code: codeOnDisk(), name: 'x', assertion: a }).then(r => r.body.error)
    expect(await go(assertion(key, { id: 'signin-1', challenge: b.body.options.challenge, signer: makeKey('es256') }))).toBe('BAD_SIGNATURE')
    expect(await go(assertion(key, { id: 'signin-1', challenge: 'another-challenge' }))).toBe('BAD_CHALLENGE')
    expect(await go(assertion(key, { id: 'signin-1', challenge: b.body.options.challenge, rpId: 'other.example' }))).toBe('BAD_RPID_HASH')
    expect(await go(assertion(key, { id: 'signin-1', challenge: b.body.options.challenge, origin: 'https://evil.example' }))).toBe('BAD_ORIGIN')
    expect(await go(assertion(key, { id: 'signin-1', challenge: b.body.options.challenge, flags: 0x01 }))).toBe('NO_USER_VERIFICATION')
    expect(fs.existsSync(path.join(dir, '.tazrim-approvers', 'approvers.json'))).toBe(false)
  })

  it('a wrong code counts tries like any registration, and the fifth cancels it', async () => {
    const key = makeKey('es256')
    const b = await adoptBegin([entry(key)])
    const right = codeOnDisk()
    const wrong = right === '000000' ? '111111' : '000000'
    const a = assertion(key, { id: 'signin-1', challenge: b.body.options.challenge })
    for (let i = 0; i < 4; i++) expect((await egress.registerFinish({ code: wrong, name: 'x', assertion: a })).body.error).toBe('BAD_CODE')
    expect((await egress.registerFinish({ code: wrong, name: 'x', assertion: a })).body.error).toBe('TOO_MANY_TRIES')
    expect((await egress.registerFinish({ code: right, name: 'x', assertion: a })).body.error).toBe('NO_REGISTRATION')
  })

  it('an assertion cannot finish a registration that was not an adoption, nor a key a password adoption', async () => {
    const key = makeKey('es256')
    const b = await egress.registerBegin({ rpId: RP })
    const a = assertion(key, { id: 'signin-1', challenge: b.body.options.challenge })
    expect((await egress.registerFinish({ code: codeOnDisk(), name: 'x', assertion: a })).body.error).toBe('BAD_REGISTRATION')
    const c = await adoptBegin([entry(key)])
    expect((await egress.registerFinish({ code: codeOnDisk(), name: 'x', password: PASSWORD })).body.error).toBe('BAD_REGISTRATION')
    expect((await egress.registerFinish({ code: codeOnDisk(), name: 'x', response: registration(key, { challenge: c.body.options.challenge }) })).body.error).toBe('BAD_REGISTRATION')
  })

  it('refuses a bad adopt list and writes no code file', async () => {
    const key = makeKey('es256')
    const good = entry(key)
    const bad = [
      [],
      'nope',
      [null],
      Array.from({ length: 21 }, (_, i) => entry(key, `c${i}`)),
      [{ ...good, id: '' }],
      [{ ...good, id: 'has space' }],
      [{ ...good, id: 'a'.repeat(401) }],
      [{ ...good, publicKey: 'AAAA' }],
      [{ ...good, publicKey: 12 }],
      [{ ...good, alg: -999 }],
      [{ ...good, alg: -8 }], // an EC key offered as EdDSA
    ]
    for (const list of bad) expect((await adoptBegin(list)).body.error).toBe('BAD_ADOPT')
    expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(false)
    expect((await adoptBegin(Array.from({ length: 20 }, (_, i) => entry(key, `c${i}`)))).status).toBe(200)
  })
})

describe('approving with a passkey', () => {
  it('begin needs an approver, validates the change now, and asks only the registered credentials', async () => {
    expect((await begin(addDomain())).body.error).toBe('NO_APPROVER')
    await registerPasskey(makeKey('es256'))
    const r = await begin(addDomain('.Shop.Example'))
    expect(r.body.change).toEqual({ action: 'add-domain', domain: '.shop.example', note: 'test' })
    expect(r.body.passwordAllowed).toBe(false)
    expect(r.body.flowId).toBeTruthy()
    expect(r.body.options).toMatchObject({ rpId: RP, userVerification: 'required', allowCredentials: [{ type: 'public-key', id: 'cred-1' }] })
    // a different site has no approver
    expect((await egress.approveBegin({ change: addDomain(), rpId: 'other.example' })).body.error).toBe('NO_APPROVER')
  })

  it('refuses changes that are not allowed or not true', async () => {
    await registerPasskey(makeKey('es256'))
    expect((await begin(addDomain('.com'))).body.error).toBe('TOO_BROAD')
    expect((await begin(addDomain('.raw.githubusercontent.com'))).body.error).toBe('SHARED_HOST')
    expect((await begin(addDomain('1.2.3.4'))).body.error).toBe('BAD_DOMAIN')
    expect((await begin(addDomain('www.bank-one.example'))).body.error).toBe('ALREADY_ALLOWED')
    expect((await begin({ action: 'remove-domain', domain: '.nothing.example' })).body.error).toBe('NOT_FOUND')
    expect((await begin({ action: 'remove-approver', id: 'nope' })).body.error).toBe('NOT_FOUND')
    expect((await begin({ action: 'explode' })).body.error).toBe('BAD_CHANGE')
    lock.busy = true
    expect((await begin(addDomain())).body.error).toBe('BUSY')
  })

  for (const kind of ['es256', 'eddsa', 'rs256']) {
    it(`a valid ${kind} approval adds the domain: files written, Squid told, change logged with the approver`, async () => {
      const key = makeKey(kind)
      await registerPasskey(key, { name: 'Phone' })
      const b = await begin(addDomain('.shop.example', 'groceries'))
      const r = await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })
      expect(r).toMatchObject({ status: 200, body: { ok: true, change: { action: 'add-domain', domain: '.shop.example' } } })
      expect(readJson('extra-domains.json')).toEqual([{ domain: '.shop.example', note: 'groceries', addedAt: new Date(clock.t).toISOString(), approver: 'Phone' }])
      expect(fs.readFileSync(path.join(dir, 'egress/extra-domains.txt'), 'utf8')).toBe(renderExtraTxt(readJson('extra-domains.json')))
      expect(fs.readFileSync(path.join(dir, 'egress/extra-domains.txt'), 'utf8')).toMatch(/^\.shop\.example$/m)
      expect(squid.execs).toHaveLength(1)
      expect(squid.execs[0]).toMatchObject({ id: 'squid-id', cmd: ['squid', '-k', 'reconfigure'] })
      // Squid is told AFTER the file holds the new domain
      expect(squid.execs[0].txt).toContain('.shop.example')
      expect(logLines().at(-1)).toMatchObject({ action: 'add-domain', detail: '.shop.example', approver: 'Phone' })
    })
  }

  it('a replay of the same response fails', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    const b = await begin(addDomain())
    const resp = assertion(key, { challenge: b.body.options.challenge })
    expect((await egress.approveFinish({ response: resp })).body.ok).toBe(true)
    const again = await egress.approveFinish({ response: resp })
    expect(again.body.error).toBe('CHALLENGE_UNKNOWN')
    expect(readJson('extra-domains.json')).toHaveLength(1)
  })

  it('a response for an unknown challenge is refused', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    expect((await egress.approveFinish({ response: assertion(key, { challenge: b64u(crypto.randomBytes(32)) }) })).body.error).toBe('CHALLENGE_UNKNOWN')
  })

  it('an expired challenge is refused', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    const b = await begin(addDomain())
    clock.t += APPROVAL_TTL_MS
    expect((await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })).body.error).toBe('CHALLENGE_EXPIRED')
    expect(fs.existsSync(path.join(dir, 'egress/extra-domains.json'))).toBe(false)
  })

  it('refuses a wrong origin, a wrong rpId hash, or a missing user verification flag (the flow is spent each time)', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    const tries = [
      [{ origin: 'https://evil.example' }, 'BAD_ORIGIN'],
      [{ rpId: 'evil.example' }, 'BAD_RPID_HASH'],
      [{ flags: 0x01 }, 'NO_USER_VERIFICATION'],
    ]
    for (const [opts, code] of tries) {
      const b = await begin(addDomain())
      expect((await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge, ...opts }) })).body.error).toBe(code)
    }
    expect(fs.existsSync(path.join(dir, 'egress/extra-domains.json'))).toBe(false)
    expect(squid.execs).toHaveLength(0)
  })

  it('a signature by a key that was never registered is refused, even under a registered credential id', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    const b = await begin(addDomain())
    const r = await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge, signer: makeKey('es256') }) })
    expect(r).toMatchObject({ status: 403, body: { error: 'BAD_SIGNATURE' } })
    const b2 = await begin(addDomain())
    const r2 = await egress.approveFinish({ response: assertion(makeKey('es256'), { id: 'cred-unknown', challenge: b2.body.options.challenge }) })
    expect(r2.body.error).toBe('UNKNOWN_CREDENTIAL')
  })

  it('tampered client data (changed after signing) fails the signature', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    const b = await begin(addDomain())
    const r = await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge, tamper: { crossOrigin: true } }) })
    expect(r.body.error).toBe('BAD_SIGNATURE')
    expect(fs.existsSync(path.join(dir, 'egress/extra-domains.json'))).toBe(false)
  })

  it('a flow created for one change cannot approve another: the approval applies exactly what begin returned', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    const a = await begin(addDomain('.one.example'))
    const b = await begin(addDomain('.two.example'))
    await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })
    expect(readJson('extra-domains.json').map(e => e.domain)).toEqual(['.two.example'])
    expect(a.body.options.challenge).not.toBe(b.body.options.challenge)
  })

  it('when Squid fails to reload, the old files come back, Squid is told again, and the error says so', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    let b = await begin(addDomain('.one.example'))
    await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })
    const before = fs.readFileSync(path.join(dir, 'egress/extra-domains.txt'), 'utf8')
    squid.execs.length = 0
    squid.exitCode = n => (n === 1 ? 1 : 0)
    b = await begin(addDomain('.two.example'))
    const r = await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })
    expect(r).toMatchObject({ status: 500, body: { error: 'RECONFIGURE_FAILED' } })
    expect(fs.readFileSync(path.join(dir, 'egress/extra-domains.txt'), 'utf8')).toBe(before)
    expect(readJson('extra-domains.json').map(e => e.domain)).toEqual(['.one.example'])
    expect(squid.execs).toHaveLength(2)
    expect(logLines().filter(l => l.detail === '.two.example')).toEqual([])
  })

  it('when Squid is not running (isolation off) it only writes the files', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    squid.running = false
    const b = await begin(addDomain())
    expect((await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })).body.ok).toBe(true)
    expect(squid.execs).toHaveLength(0)
    expect(readJson('extra-domains.json')).toHaveLength(1)
  })

  it('removes a domain the same way', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    let b = await begin(addDomain())
    await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })
    b = await begin({ action: 'remove-domain', domain: '.shop.example' })
    expect((await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })).body.ok).toBe(true)
    expect(readJson('extra-domains.json')).toEqual([])
    expect(fs.readFileSync(path.join(dir, 'egress/extra-domains.txt'), 'utf8')).not.toContain('shop.example')
    expect(logLines().at(-1)).toMatchObject({ action: 'remove-domain', detail: '.shop.example' })
  })

  it('turn-off starts the switching job only with a valid approval', async () => {
    const key = makeKey('es256')
    await registerPasskey(key, { name: 'Phone' })
    const b = await begin({ action: 'turn-off' })
    const bad = await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge, signer: makeKey('es256') }) })
    expect(bad.body.error).toBe('BAD_SIGNATURE')
    expect(config.started).toEqual([])
    const b2 = await begin({ action: 'turn-off' })
    const r = await egress.approveFinish({ response: assertion(key, { challenge: b2.body.options.challenge }) })
    expect(r.body).toMatchObject({ ok: true, job: { egress: 'off' } })
    expect(config.started).toEqual([false])
    expect(logLines().at(-1)).toMatchObject({ action: 'turn-off', approver: 'Phone' })
  })

  it('turn-off is refused at begin when isolation is already off', async () => {
    await registerPasskey(makeKey('es256'))
    config.context = async () => ({ ctx: { configFiles: ['/h/docker-compose.yml'] } })
    expect((await begin({ action: 'turn-off' })).body.error).toBe('ALREADY_OFF')
  })

  it('removes an approver (the last one too)', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    const b = await begin({ action: 'remove-approver', id: 'cred-1' })
    expect((await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })).body.ok).toBe(true)
    expect(readJson('approvers.json')).toEqual([])
    expect(logLines().at(-1)).toMatchObject({ action: 'remove-approver', detail: 'My phone' })
  })
})

describe('approving with the password', () => {
  it('begin offers the password, and no passkey options when there is no passkey', async () => {
    await registerPassword()
    const r = await begin(addDomain())
    expect(r.body).toMatchObject({ options: null, passwordAllowed: true })
  })

  it('the right password applies the change and logs the approver with (סיסמה)', async () => {
    await registerPassword('Home')
    const b = await begin(addDomain())
    const r = await egress.approveFinish({ flowId: b.body.flowId, password: PASSWORD })
    expect(r.body.ok).toBe(true)
    expect(readJson('extra-domains.json')[0]).toMatchObject({ domain: '.shop.example', approver: 'Home (סיסמה)' })
    expect(logLines().at(-1)).toMatchObject({ action: 'add-domain', approver: 'Home (סיסמה)' })
    expect(JSON.stringify(logLines())).not.toContain(PASSWORD)
  })

  it('a wrong password is refused and spends the flow', async () => {
    await registerPassword()
    const b = await begin(addDomain())
    expect(await egress.approveFinish({ flowId: b.body.flowId, password: 'not the password!!' })).toMatchObject({ status: 403, body: { error: 'BAD_PASSWORD' } })
    expect((await egress.approveFinish({ flowId: b.body.flowId, password: PASSWORD })).body.error).toBe('CHALLENGE_UNKNOWN')
    expect(fs.existsSync(path.join(dir, 'egress/extra-domains.json'))).toBe(false)
  })

  it('5 wrong passwords lock password approvals for 15 minutes, even for the right one; passkeys still work', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    await registerPassword()
    for (let i = 0; i < 5; i++) {
      const b = await begin(addDomain())
      expect((await egress.approveFinish({ flowId: b.body.flowId, password: `wrong password ${i}` })).body.error).toBe('BAD_PASSWORD')
    }
    const b = await begin(addDomain())
    const locked = await egress.approveFinish({ flowId: b.body.flowId, password: PASSWORD })
    expect(locked).toMatchObject({ status: 429, body: { error: 'LOCKED', until: new Date(clock.t + PASSWORD_LOCK_MS).toISOString() } })
    // the flow was not spent by the lock: a passkey can still answer it
    expect((await egress.approveFinish({ response: assertion(key, { challenge: b.body.options.challenge }) })).body.ok).toBe(true)
    // after 15 minutes it works again
    clock.t += PASSWORD_LOCK_MS
    const b2 = await begin({ action: 'remove-domain', domain: '.shop.example' })
    expect((await egress.approveFinish({ flowId: b2.body.flowId, password: PASSWORD })).body.ok).toBe(true)
  })

  it('a burst of parallel password tries gets no more than 5 checks', async () => {
    await registerPassword()
    const flows = []
    for (let i = 0; i < 12; i++) flows.push((await begin(addDomain())).body.flowId)
    const answers = await Promise.all(flows.map((flowId, i) => egress.approveFinish({ flowId, password: `wrong password ${i}` })))
    const errors = answers.map(a => a.body.error)
    expect(errors.filter(e => e === 'BAD_PASSWORD')).toHaveLength(5)
    expect(errors.filter(e => e === 'LOCKED')).toHaveLength(7)
  })

  it('a used flowId, an unknown one and an expired one are refused', async () => {
    await registerPassword()
    const b = await begin(addDomain())
    expect((await egress.approveFinish({ flowId: b.body.flowId, password: PASSWORD })).body.ok).toBe(true)
    expect((await egress.approveFinish({ flowId: b.body.flowId, password: PASSWORD })).body.error).toBe('CHALLENGE_UNKNOWN')
    expect((await egress.approveFinish({ flowId: 'nope', password: PASSWORD })).body.error).toBe('CHALLENGE_UNKNOWN')
    const b2 = await begin({ action: 'remove-domain', domain: '.shop.example' })
    clock.t += APPROVAL_TTL_MS
    expect((await egress.approveFinish({ flowId: b2.body.flowId, password: PASSWORD })).body.error).toBe('CHALLENGE_EXPIRED')
  })
})

describe('turning isolation on', () => {
  it('needs no approval, starts the job and logs it', async () => {
    const r = await egress.turnOn()
    expect(r).toMatchObject({ status: 202, body: { job: { egress: 'on' } } })
    expect(config.started).toEqual([true])
    expect(logLines().at(-1)).toMatchObject({ action: 'turn-on', approver: null })
  })
})

describe('info', () => {
  it('reports state without any secret', async () => {
    await registerPasskey(makeKey('es256'))
    await registerPassword()
    await egress.registerBegin({ rpId: RP })
    const r = await egress.info()
    expect(r.body).toMatchObject({ available: true, on: true, extraDomains: [], registration: { pending: true } })
    expect(r.body.approvers.map(a => a.kind).sort()).toEqual(['passkey', 'password'])
    const text = JSON.stringify(r.body)
    for (const secret of ['hash', 'salt', 'publicKey', codeOnDisk()]) expect(text).not.toContain(secret)
    expect(r.body.changes[0]).toMatchObject({ action: 'add-approver' })
    expect(r.body.changes.length).toBeLessThanOrEqual(50)
  })

  it('is unavailable without compose', async () => {
    config.context = async () => ({ reason: 'NO_INSTALL_MOUNT' })
    expect((await egress.info()).body).toMatchObject({ available: false, reason: 'NO_INSTALL_MOUNT', on: false })
  })
})

describe('renderExtraTxt', () => {
  it('comments out an entry a broader one covers', () => {
    const txt = renderExtraTxt([{ domain: '.a.example' }, { domain: 'www.a.example' }, { domain: '.b.example' }])
    expect(txt.split('\n').filter(l => l && !l.startsWith('#'))).toEqual(['.a.example', '.b.example'])
    expect(txt).toContain('# www.a.example  (already covered by .a.example)')
  })
})

describe('state across job containers (ENG-136)', () => {
  const keys = f => path.join(dir, '.tazrim-approvers', f)

  it('a registration begun in one instance is finished in another', async () => {
    const key = makeKey('es256')
    const b = await egress.registerBegin({ rpId: RP, rpName: 'Tazrim', userName: 'me' })
    expect(fs.statSync(keys('pending-registration.json')).mode & 0o777).toBe(0o600)
    expect(fs.statSync(path.join(dir, '.tazrim-approvers')).mode & 0o777).toBe(0o700)
    const other = restart()
    expect((await other.info()).body.registration).toMatchObject({ pending: true })
    const r = await other.registerFinish({ code: codeOnDisk(), name: 'My phone', response: registration(key, { challenge: b.body.options.challenge }) })
    expect(r.body).toMatchObject({ ok: true })
    expect(fs.existsSync(keys('pending-registration.json'))).toBe(false)
    expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(false)
    expect((await restart().info()).body.registration).toBeNull()
  })

  it('wrong codes are counted across instances, and the fifth cancels the registration', async () => {
    await egress.registerBegin({ rpId: RP })
    const wrong = codeOnDisk() === '000000' ? '111111' : '000000'
    const errors = []
    for (let i = 0; i < 5; i++) errors.push((await restart().registerFinish({ code: wrong, name: 'x', response: {} })).body.error)
    expect(errors).toEqual(['BAD_CODE', 'BAD_CODE', 'BAD_CODE', 'BAD_CODE', 'TOO_MANY_TRIES'])
    expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(false)
  })

  it('an expired registration is gone for the next instance, and its code file is removed lazily', async () => {
    await egress.registerBegin({ rpId: RP })
    clock.t += CODE_TTL_MS
    expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(true) // no timer removes it
    const other = restart()
    expect((await other.registerFinish({ code: '123456', name: 'x', response: {} })).body.error).toBe('NO_REGISTRATION')
    expect(fs.existsSync(path.join(dir, CODE_FILE))).toBe(false)
    expect(fs.existsSync(keys('pending-registration.json'))).toBe(false)
  })

  it('an approval begun in one instance is finished in another, once', async () => {
    await registerPassword()
    const b = await egress.approveBegin({ change: addDomain(), rpId: RP })
    expect(fs.statSync(keys('pending-approvals.json')).mode & 0o777).toBe(0o600)
    const r = await restart().approveFinish({ flowId: b.body.flowId, password: PASSWORD })
    expect(r.body.ok).toBe(true)
    expect((await restart().approveFinish({ flowId: b.body.flowId, password: PASSWORD })).body.error).toBe('CHALLENGE_UNKNOWN')
  })

  it('an approval that expired while no process ran is refused by the next one', async () => {
    await registerPassword()
    const b = await egress.approveBegin({ change: addDomain(), rpId: RP })
    clock.t += APPROVAL_TTL_MS
    expect((await restart().approveFinish({ flowId: b.body.flowId, password: PASSWORD })).body.error).toBe('CHALLENGE_EXPIRED')
  })

  it('two instances taking the same approval at once: only one gets it', async () => {
    await registerPassword()
    const b = await egress.approveBegin({ change: addDomain(), rpId: RP })
    const answers = await Promise.all([restart(), restart(), restart()].map(e => e.approveFinish({ flowId: b.body.flowId, password: PASSWORD })))
    expect(answers.filter(a => a.body.ok)).toHaveLength(1)
    expect(answers.filter(a => a.body.error === 'CHALLENGE_UNKNOWN')).toHaveLength(2)
  })

  it('the password lock holds across instances, and ends on time', async () => {
    await registerPassword()
    for (let i = 0; i < 5; i++) {
      const b = await restart().approveBegin({ change: addDomain(), rpId: RP })
      expect((await restart().approveFinish({ flowId: b.body.flowId, password: `wrong password ${i}` })).body.error).toBe('BAD_PASSWORD')
    }
    expect(fs.statSync(keys('password-lock.json')).mode & 0o777).toBe(0o600)
    const b = await restart().approveBegin({ change: addDomain(), rpId: RP })
    expect(await restart().approveFinish({ flowId: b.body.flowId, password: PASSWORD })).toMatchObject({ status: 429, body: { error: 'LOCKED', until: new Date(clock.t + PASSWORD_LOCK_MS).toISOString() } })
    clock.t += PASSWORD_LOCK_MS
    const b2 = await restart().approveBegin({ change: addDomain(), rpId: RP })
    expect((await restart().approveFinish({ flowId: b2.body.flowId, password: PASSWORD })).body.ok).toBe(true)
  })

  it('a burst of tries spread over instances still gets no more than 5 checks', async () => {
    await registerPassword()
    const flows = []
    for (let i = 0; i < 12; i++) flows.push((await begin(addDomain())).body.flowId)
    const answers = await Promise.all(flows.map((flowId, i) => restart().approveFinish({ flowId, password: `wrong password ${i}` })))
    expect(answers.filter(a => a.body.error === 'BAD_PASSWORD')).toHaveLength(5)
    expect(answers.filter(a => a.body.error === 'LOCKED')).toHaveLength(7)
  })

  it('a try that never reached the password check is not counted as a failure', async () => {
    await registerPassword()
    for (let i = 0; i < 8; i++) expect((await restart().approveFinish({ flowId: `unknown-${i}`, password: 'x'.repeat(12) })).body.error).toBe('CHALLENGE_UNKNOWN')
    const b = await begin(addDomain())
    expect((await restart().approveFinish({ flowId: b.body.flowId, password: PASSWORD })).body.ok).toBe(true)
  })

  it('a job that finishes an async change hands its tail back as `done`', async () => {
    const r = await restart().turnOn()
    expect(r.status).toBe(202)
    await expect(r.done).resolves.toBeUndefined()
  })
})

describe('approving an update\'s compose files (ENG-137)', () => {
  const H = crypto.createHash('sha256').update('new file').digest('hex')
  const change = { action: 'update-compose', version: '1.2.0', files: { 'docker-compose.yml': H } }

  it('has approvers only once one is registered', async () => {
    expect(egress.hasApprovers()).toBe(false)
    await registerPassword()
    expect(egress.hasApprovers()).toBe(true)
  })

  it('begin takes the change in its one shape and refuses a malformed one', async () => {
    await registerPassword()
    const b = await begin({ ...change, files: { 'docker-compose.yml': H, '.env': H } })
    expect(b.body.error).toBe('BAD_CHANGE')
    expect((await begin({ ...change, version: 'latest' })).body.error).toBe('BAD_CHANGE')
    const ok = await begin(change)
    expect(ok.body.change).toEqual(change)
    expect(ok.body.passwordAllowed).toBe(true)
  })

  it('a password approval for exactly this change passes, once, and is logged with its approver', async () => {
    await registerPassword('Home password')
    const b = await begin(change)
    const r = await egress.verifyApproval({ flowId: b.body.flowId, password: PASSWORD }, change)
    expect(r).toEqual({ ok: true, approver: 'Home password (סיסמה)' })
    expect(logLines().at(-1)).toMatchObject({ action: 'update-compose', detail: 'v1.2.0: docker-compose.yml' })
    // single use: the same flow again is gone
    expect((await egress.verifyApproval({ flowId: b.body.flowId, password: PASSWORD }, change)).body.error).toBe('CHALLENGE_UNKNOWN')
  })

  it('a passkey approval passes; one for another change or another set of files does not', async () => {
    const key = makeKey('es256')
    await registerPasskey(key)
    const b = await begin(change)
    expect((await egress.verifyApproval({ response: assertion(key, { challenge: b.body.options.challenge }) }, change)).ok).toBe(true)

    const other = await begin(change)
    const r = await egress.verifyApproval({ response: assertion(key, { challenge: other.body.options.challenge }) }, { ...change, files: { 'docker-compose.egress.yml': H } })
    expect(r.body.error).toBe('BAD_CHANGE')
    // an approval for a different kind of change cannot be reused here either
    const domain = await begin(addDomain())
    expect((await egress.verifyApproval({ response: assertion(key, { challenge: domain.body.options.challenge }) }, change)).body.error).toBe('BAD_CHANGE')
  })

  it('a wrong password counts toward the lock, and the lock applies here too', async () => {
    await registerPassword()
    for (let i = 0; i < 5; i++) {
      const b = await begin(change)
      expect((await egress.verifyApproval({ flowId: b.body.flowId, password: 'wrong password value' }, change)).body.error).toBe('BAD_PASSWORD')
    }
    const b = await begin(change)
    const r = await egress.verifyApproval({ flowId: b.body.flowId, password: PASSWORD }, change)
    expect(r.body.error).toBe('LOCKED')
  })

  it('finishing it through the egress approval applies nothing', async () => {
    await registerPassword()
    const b = await begin(change)
    const r = await egress.approveFinish({ flowId: b.body.flowId, password: PASSWORD })
    expect(r.body.error).toBe('BAD_CHANGE')
  })
})
