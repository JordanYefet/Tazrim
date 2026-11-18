import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET, POST, DELETE } from '../route'
import { GET as browserGet, PUT as browserPut } from '../browser/route'
import { append, entriesAfter, resetLog } from '@/lib/log/buffer'
import { getShowBrowser, setShowBrowser } from '@/lib/log/browser-flag'

// What Next.js sets on a plain `curl http://localhost:3000/...`, and on a request from another device
const local = { host: 'localhost:3000', 'x-forwarded-host': 'localhost:3000', 'x-forwarded-for': '127.0.0.1' }
const lan = { host: '192.168.1.20:3000', 'x-forwarded-host': '192.168.1.20:3000', 'x-forwarded-for': '192.168.1.50' }

const req = (method: string, headers: Record<string, string>, body?: unknown, path = '/api/logs') =>
  new Request(`http://localhost:3000${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })

const env = { ...process.env }
beforeEach(() => {
  resetLog()
  setShowBrowser(false)
  delete process.env.TAZRIM_READ_ONLY
  delete process.env.TAZRIM_IN_DOCKER
  delete process.env.TAZRIM_CHROMIUM_ARGS
  process.env.TAZRIM_AUTH = 'off'
})
afterEach(() => {
  process.env = { ...env }
})

describe('/api/logs gating (like the bank sync)', () => {
  it('serves this machine, with the login off', async () => {
    append('info', 'app', 'hello')
    const res = await GET(req('GET', local))
    expect(res.status).toBe(200)
    expect((await res.json()).entries).toHaveLength(1)
  })

  it('refuses another device while the login is off', async () => {
    append('info', 'app', 'hello')
    for (const [fn, r] of [
      [GET, req('GET', lan)],
      [POST, req('POST', lan, { label: 'x' })],
      [DELETE, req('DELETE', lan)],
      [browserGet, req('GET', lan, undefined, '/api/logs/browser')],
      [browserPut, req('PUT', lan, { show: true }, '/api/logs/browser')],
    ] as const) {
      const res = await fn(r)
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe('NOT_LOCAL')
    }
    expect(entriesAfter()).toHaveLength(1)
    expect(getShowBrowser()).toBe(false)
  })

  it('serves any device once the login is on (the middleware let only a signed-in member through)', async () => {
    delete process.env.TAZRIM_AUTH
    expect((await GET(req('GET', lan))).status).toBe(200)
  })

  it('refuses everything in read-only mode, even from this machine', async () => {
    process.env.TAZRIM_READ_ONLY = '1'
    for (const [fn, r] of [
      [GET, req('GET', local)],
      [POST, req('POST', local, { label: 'x' })],
      [DELETE, req('DELETE', local)],
      [browserGet, req('GET', local, undefined, '/api/logs/browser')],
      [browserPut, req('PUT', local, { show: true }, '/api/logs/browser')],
    ] as const) {
      const res = await fn(r)
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe('READ_ONLY')
    }
  })
})

describe('/api/logs', () => {
  it('GET ?after returns only newer entries', async () => {
    const a = append('info', 'app', 'one')
    append('info', 'app', 'two')
    const res = await GET(req('GET', local, undefined, `/api/logs?after=${a.id}`))
    expect((await res.json()).entries.map((e: { msg: string }) => e.msg)).toEqual(['two'])
  })

  it('POST stores an action marker, redacted; an empty label is refused', async () => {
    expect((await POST(req('POST', local, { label: 'מעבר לדף כרטיסים' }))).status).toBe(200)
    expect(entriesAfter()[0]).toMatchObject({ source: 'app', level: 'info', data: { action: true } })
    expect((await POST(req('POST', local, { label: '  ' }))).status).toBe(400)
  })

  it('DELETE clears', async () => {
    append('info', 'app', 'x')
    expect((await DELETE(req('DELETE', local))).status).toBe(200)
    expect(entriesAfter()).toEqual([])
  })
})

describe('/api/logs/browser', () => {
  it('turns the sync browser switch on and off', async () => {
    expect((await browserPut(req('PUT', local, { show: true }, '/api/logs/browser'))).status).toBe(200)
    expect(getShowBrowser()).toBe(true)
    expect((await (await browserGet(req('GET', local, undefined, '/api/logs/browser'))).json()).show).toBe(true)
  })

  it('refuses in Docker, and says so', async () => {
    process.env.TAZRIM_IN_DOCKER = '1'
    const res = await browserPut(req('PUT', local, { show: true }, '/api/logs/browser'))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('IN_DOCKER')
    expect(getShowBrowser()).toBe(false)
    expect((await (await browserGet(req('GET', local, undefined, '/api/logs/browser'))).json()).inDocker).toBe(true)
  })

  it('refuses a non-boolean', async () => {
    expect((await browserPut(req('PUT', local, { show: 'yes' }, '/api/logs/browser'))).status).toBe(400)
  })
})
