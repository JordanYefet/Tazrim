import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createJobs } from '../job.mjs'
import { createServer } from '../server.mjs'
import { fakes, memStore } from './fakes.mjs'

const TOKEN = 'c'.repeat(64)
let server, base, seen

beforeEach(async () => {
  seen = []
  const f = fakes()
  const jobs = createJobs({ docker: f.docker, app: f.app, status: memStore(), healthTimeoutMs: 1000 })
  const reply = name => async body => (seen.push([name, body]), { status: 200, body: { name } })
  const egress = {
    info: reply('info'),
    turnOn: reply('turnOn'),
    registerBegin: reply('registerBegin'),
    registerFinish: reply('registerFinish'),
    approveBegin: reply('approveBegin'),
    approveFinish: async b => (seen.push(['approveFinish', b]), { status: 403, body: { error: 'BAD_SIGNATURE' } }),
  }
  server = createServer({ jobs, config: { current: () => null, info: async () => ({}) }, egress, token: TOKEN, helperVersion: '9.9.9' })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterEach(() => new Promise(r => server.close(r)))

const call = (p, { token = TOKEN, method = 'GET', body } = {}) =>
  fetch(base + p, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

describe('egress routes', () => {
  it('are behind the token and listed as a feature', async () => {
    for (const [method, p] of [['GET', '/v1/egress'], ['POST', '/v1/egress/on'], ['POST', '/v1/egress/approvers/register/begin'], ['POST', '/v1/egress/approvers/register/finish'], ['POST', '/v1/egress/approve/begin'], ['POST', '/v1/egress/approve/finish']]) {
      expect((await call(p, { method, token: null, body: method === 'POST' ? {} : undefined })).status, p).toBe(401)
    }
    expect(seen).toEqual([])
    expect((await (await call('/v1/health')).json()).features).toContain('egress')
  })

  it('hand the body to the module and pass its status and body on as JSON', async () => {
    expect(await (await call('/v1/egress')).json()).toEqual({ name: 'info' })
    expect(await (await call('/v1/egress/on', { method: 'POST' })).json()).toEqual({ name: 'turnOn' })
    const r = await call('/v1/egress/approve/finish', { method: 'POST', body: { flowId: 'x', password: 'fake password value' } })
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'BAD_SIGNATURE' })
    expect(seen.at(-1)).toEqual(['approveFinish', { flowId: 'x', password: 'fake password value' }])
    expect((await call('/v1/egress', { method: 'POST' })).status).toBe(405)
  })

  it('accept a passkey-sized body (several KB)', async () => {
    const big = { code: '123456', name: 'x', response: { id: 'a', response: { attestationObject: 'A'.repeat(6000) } } }
    expect((await call('/v1/egress/approvers/register/finish', { method: 'POST', body: big })).status).toBe(200)
  })
})
