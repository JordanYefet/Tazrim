import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
    expect((await call('/v1/rollback', { method: 'POST' })).status).toBe(409)
  })

  it('unknown paths are 404, also outside /v1', async () => {
    expect((await call('/health')).status).toBe(404)
    expect((await call('/v1/nope')).status).toBe(404)
  })
})

describe('ensureToken', () => {
  let dir
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('creates a 0600 token once and then reuses it', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-updater-'))
    const chowned = []
    const token = ensureToken(dir, { chown: (file, uid, gid) => chowned.push([file, uid, gid]) })
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const file = path.join(dir, '.updater-token')
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    expect(chowned).toContainEqual([file, 1000, 1000])
    expect(ensureToken(dir, { chown: () => {} })).toBe(token)
  })
})
