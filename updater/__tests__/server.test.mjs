import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJobs } from '../job.mjs'
import { createServer, ensureToken } from '../server.mjs'
import { fakes, memStore } from './fakes.mjs'

const TOKEN = 'a'.repeat(64)
let server, base, f

beforeEach(async () => {
  f = fakes()
  const jobs = createJobs({ docker: f.docker, app: f.app, status: memStore(), healthTimeoutMs: 1000 })
  server = createServer({ jobs, token: TOKEN, helperVersion: '9.9.9' })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterEach(() => new Promise(r => server.close(r)))

const call = (p, { token = TOKEN, method = 'GET', body } = {}) =>
  fetch(base + p, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('auth', () => {
  it('answers 401 without the token or with a wrong one', async () => {
    for (const p of ['/v1/health', '/v1/status']) {
      expect((await call(p, { token: null })).status).toBe(401)
      expect((await call(p, { token: 'b'.repeat(64) })).status).toBe(401)
      expect((await call(p, { token: 'short' })).status).toBe(401)
    }
    expect((await call('/v1/update', { token: null, method: 'POST', body: { version: '1.2.0' } })).status).toBe(401)
    expect((await call('/v1/rollback', { token: 'nope', method: 'POST' })).status).toBe(401)
    expect(f.calls.map(c => c[0])).not.toContain('pull')
  })
})

describe('routes', () => {
  it('GET /v1/health reports the helper and the target', async () => {
    const r = await call('/v1/health')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      ok: true,
      helperVersion: '9.9.9',
      api: 1,
      features: [],
      updatable: true,
      image: 'ghcr.io/jordanyefet/tazrim:1.0.0',
      runningVersion: '1.0.0',
    })
  })

  it('POST /v1/update refuses a version with anything but x.y.z', async () => {
    const r = await call('/v1/update', { method: 'POST', body: { version: '1.2.0; rm -rf /' } })
    expect(r.status).toBe(400)
    expect(f.calls.map(c => c[0])).not.toContain('pull')
  })

  it('POST /v1/update refuses a version that is not newer', async () => {
    const r = await call('/v1/update', { method: 'POST', body: { version: '0.0.1' } })
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ code: 'NOT_NEWER' })
    expect(f.calls.map(c => c[0])).not.toContain('pull')
  })

  it('POST /v1/update refuses a body that is not JSON', async () => {
    const r = await fetch(base + '/v1/update', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: 'version=1.2.0' })
    expect(r.status).toBe(400)
  })

  it('POST /v1/update starts a job; GET /v1/status shows it', async () => {
    const r = await call('/v1/update', { method: 'POST', body: { version: '1.2.0' } })
    expect(r.status).toBe(202)
    expect((await r.json()).job).toMatchObject({ kind: 'update', from: '1.0.0', to: '1.2.0' })
    const s = await call('/v1/status')
    expect(s.status).toBe(200)
    expect(await s.json()).toMatchObject({ kind: 'update', to: '1.2.0' })
  })

  it('POST /v1/rollback without a finished update is 409', async () => {
    const r = await call('/v1/rollback', { method: 'POST' })
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ code: 'NO_ROLLBACK', error: expect.any(String) })
  })

  it('unknown paths are 404, also outside /v1', async () => {
    expect((await call('/health')).status).toBe(404)
    expect((await call('/v1/nope')).status).toBe(404)
  })
})

describe('ensureToken', () => {
  let dir
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  afterEach(() => vi.restoreAllMocks())

  it('creates a 0600 token owned by 1000:1000 once and then reuses it', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-updater-'))
    const chown = vi.spyOn(fs, 'fchownSync').mockImplementation(() => {})
    const token = ensureToken(dir)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const file = path.join(dir, '.updater-token')
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    expect(chown).toHaveBeenCalledWith(expect.any(Number), 1000, 1000)
    expect(ensureToken(dir)).toBe(token)
  })

  it('never follows a symlink planted as the token file', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-updater-'))
    vi.spyOn(fs, 'fchownSync').mockImplementation(() => {})
    const victim = path.join(dir, 'victim')
    fs.writeFileSync(victim, 'f'.repeat(64), { mode: 0o644 })
    const file = path.join(dir, '.updater-token')
    fs.symlinkSync(victim, file)
    const token = ensureToken(dir)
    expect(token).not.toBe('f'.repeat(64))
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toBe(token)
    expect(fs.readFileSync(victim, 'utf8')).toBe('f'.repeat(64))
    expect(fs.statSync(victim).mode & 0o777).toBe(0o644)
  })
})

describe('config routes (ENG-121)', () => {
  let s2, base2
  const configCalls = []
  const config = {
    info: async () => ({ available: true, values: { TAZRIM_PORT: '3000' }, installDir: '/home/someone/tazrim' }),
    current: () => ({ kind: 'config', state: 'done' }),
    async start(changes) {
      configCalls.push(changes)
      return changes?.TAZRIM_PORT === 'bad' ? { status: 400, code: 'INVALID_VALUE', key: 'TAZRIM_PORT', error: 'x' } : { status: 202, job: { kind: 'config', state: 'running' } }
    },
  }
  beforeEach(async () => {
    const g = fakes()
    s2 = createServer({ jobs: createJobs({ docker: g.docker, app: g.app, status: memStore() }), config, token: TOKEN, helperVersion: '9.9.9' })
    await new Promise(r => s2.listen(0, '127.0.0.1', r))
    base2 = `http://127.0.0.1:${s2.address().port}`
  })
  afterEach(() => new Promise(r => s2.close(r)))
  const call2 = (p, { token = TOKEN, method = 'GET', body } = {}) =>
    fetch(base2 + p, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

  it('health lists the config feature', async () => {
    expect(await (await call2('/v1/health')).json()).toMatchObject({ api: 1, features: ['config'] })
  })

  it('needs the token', async () => {
    expect((await call2('/v1/config', { token: null })).status).toBe(401)
    expect((await call2('/v1/config', { token: 'b'.repeat(64), method: 'POST', body: { changes: { TAZRIM_PORT: '3005' } } })).status).toBe(401)
    expect(configCalls).toEqual([])
  })

  it('GET /v1/config, POST /v1/config and the config status', async () => {
    expect(await (await call2('/v1/config')).json()).toMatchObject({ available: true, installDir: '/home/someone/tazrim' })
    const r = await call2('/v1/config', { method: 'POST', body: { changes: { TAZRIM_PORT: '3005' } } })
    expect(r.status).toBe(202)
    expect((await r.json()).job).toMatchObject({ kind: 'config' })
    const bad = await call2('/v1/config', { method: 'POST', body: { changes: { TAZRIM_PORT: 'bad' } } })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ code: 'INVALID_VALUE', key: 'TAZRIM_PORT' })
    expect(await (await call2('/v1/status?kind=config')).json()).toEqual({ kind: 'config', state: 'done' })
    expect(await (await call2('/v1/status')).json()).toBeNull()
  })

  it('a helper without config answers 404 there', async () => {
    expect((await call('/v1/config')).status).toBe(404)
  })
})
