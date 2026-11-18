/**
 * The "this computer" door (ENG-119): a proxy that stamps every request with a
 * secret only this process knows, so isThisComputer() can't be faked by headers.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createLocalDoor, forwardHeaders, LOCAL_HEADER, startLocalDoor } from '../local-door'
import { isLocalRequest, isThisComputer } from '../local-request'

const SECRET = 'a'.repeat(64)

/** What the upstream saw, per request */
interface Seen { method: string; url: string; headers: http.IncomingHttpHeaders; rawHeaders: string[]; body: string }

let upstream: http.Server
let upstreamPort = 0
let door: http.Server
let doorPort = 0
const seen: Seen[] = []

const listen = (s: http.Server, host = '127.0.0.1') =>
  new Promise<number>(resolve => s.listen(0, host, () => resolve((s.address() as AddressInfo).port)))
const close = (s: http.Server) => new Promise<void>(resolve => s.close(() => resolve()))

/** A raw request through the door, so any header (Host, Connection…) can be set as a client would */
function request(port: number, opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: opts.method ?? 'GET', path: opts.path ?? '/', headers: opts.headers, setHost: !opts.headers?.host }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', c => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', c => (body += c))
    req.on('end', () => {
      seen.push({ method: req.method!, url: req.url!, headers: req.headers, rawHeaders: req.rawHeaders, body })
      res.setHeader('x-upstream', 'yes')
      res.setHeader('set-cookie', ['a=1', 'b=2'])
      res.setHeader('keep-alive', 'timeout=99')
      res.setHeader('x-hop-out', '1')
      res.setHeader('connection', 'x-hop-out')
      res.end(`got ${req.method} ${req.url} ${body}`)
    })
  })
  upstreamPort = await listen(upstream)
  door = createLocalDoor(upstreamPort, SECRET)
  doorPort = await listen(door)
})

afterAll(async () => {
  await close(door)
  await close(upstream)
})

afterEach(() => {
  seen.length = 0
})

describe('the door', () => {
  it('forwards method, path, body and Host as sent, and the answer back', async () => {
    const res = await request(doorPort, {
      method: 'POST',
      path: '/api/auth/setup?x=1',
      headers: { host: 'localhost:3000', 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.7' },
      body: '{"name":"Owner"}',
    })
    expect(res.status).toBe(200)
    expect(res.body).toBe('got POST /api/auth/setup?x=1 {"name":"Owner"}')
    expect(res.headers['x-upstream']).toBe('yes')
    expect(res.headers['set-cookie']).toEqual(['a=1', 'b=2'])
    const s = seen[0]
    expect(s.headers.host).toBe('localhost:3000')
    expect(s.headers['content-type']).toBe('application/json')
    expect(s.headers['x-forwarded-for']).toBe('192.0.2.7')
    expect(s.headers[LOCAL_HEADER]).toBe(SECRET)
  })

  it("overwrites an x-tazrim-local the client sent, and never sends the secret back", async () => {
    const res = await request(doorPort, { headers: { [LOCAL_HEADER]: 'guess', 'X-Tazrim-Local': 'another guess' } as Record<string, string> })
    const stamps = seen[0].rawHeaders.filter((_, i, a) => i % 2 === 1 && a[i - 1].toLowerCase() === LOCAL_HEADER)
    expect(stamps).toEqual([SECRET])
    expect(JSON.stringify(res.headers)).not.toContain(SECRET)
    expect(res.body).not.toContain(SECRET)
  })

  it('drops hop-by-hop headers both ways, and any the Connection header names', async () => {
    const res = await request(doorPort, { headers: { connection: 'keep-alive, x-secret-hop', 'x-secret-hop': '1', te: 'trailers', 'proxy-authorization': 'Basic Zm9vOmJhcg==', 'x-kept': 'yes' } })
    const h = seen[0].headers
    expect(h['x-secret-hop']).toBeUndefined()
    expect(h.te).toBeUndefined()
    expect(h['proxy-authorization']).toBeUndefined()
    expect(h['x-kept']).toBe('yes')
    // (the door's own server may add its own Keep-Alive; the upstream's never passes)
    expect(res.headers['keep-alive']).not.toBe('timeout=99')
    expect(res.headers['x-hop-out']).toBeUndefined()
  })

  it('answers 502 when the app is not answering', async () => {
    const dead = http.createServer()
    const deadPort = await listen(dead)
    await close(dead)
    const lonely = createLocalDoor(deadPort, SECRET)
    const port = await listen(lonely)
    try {
      const res = await request(port, {})
      expect(res.status).toBe(502)
      expect(res.body).not.toContain(SECRET)
    } finally {
      await close(lonely)
    }
  })

  it('forwardHeaders keeps repeated headers and the client spelling', () => {
    expect(forwardHeaders(['Accept', 'a', 'accept', 'b', 'X-Tazrim-Local', 'x'], SECRET)).toEqual(['Accept', 'a', 'accept', 'b', LOCAL_HEADER, SECRET])
  })
})

describe('startLocalDoor', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  it('is off without TAZRIM_LOCAL_PORT, and removes a secret that came from outside', () => {
    delete process.env.TAZRIM_LOCAL_PORT
    process.env.TAZRIM_LOCAL_SECRET = SECRET
    startLocalDoor()
    expect(process.env.TAZRIM_LOCAL_SECRET).toBeUndefined()
  })

  it('stays off in the read-only demo', () => {
    process.env.TAZRIM_LOCAL_PORT = '3999'
    process.env.TAZRIM_LOCAL_SECRET = SECRET
    startLocalDoor({ off: true })
    expect(process.env.TAZRIM_LOCAL_SECRET).toBeUndefined()
  })

  it('opens once, on 127.0.0.1 by default, with a fresh 32-byte secret, and a second call changes nothing', async () => {
    const probe = http.createServer()
    const port = await listen(probe)
    await close(probe)
    process.env.TAZRIM_LOCAL_PORT = String(port)
    process.env.PORT = String(upstreamPort)
    process.env.TAZRIM_LOCAL_SECRET = SECRET // from outside: replaced
    delete process.env.TAZRIM_LOCAL_HOST
    startLocalDoor()
    const secret = process.env.TAZRIM_LOCAL_SECRET!
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    expect(secret).not.toBe(SECRET)
    startLocalDoor()
    expect(process.env.TAZRIM_LOCAL_SECRET).toBe(secret)

    const g = globalThis as unknown as { __tazrimLocalDoor?: { server: http.Server } }
    const server = g.__tazrimLocalDoor!.server
    await new Promise(r => (server.listening ? r(null) : server.once('listening', r)))
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1')
    try {
      await request(port, { headers: { host: 'localhost:3000' } })
      const h = new Headers(seen[0].headers as Record<string, string>)
      expect(isThisComputer(h)).toBe(true)
    } finally {
      await close(server)
      delete g.__tazrimLocalDoor
    }
  })
})

describe('isThisComputer', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })
  const on = () => {
    process.env.TAZRIM_LOCAL_PORT = '3001'
    process.env.TAZRIM_LOCAL_SECRET = SECRET
  }

  it('is true only with the door on and its exact secret', () => {
    on()
    expect(isThisComputer(new Headers({ [LOCAL_HEADER]: SECRET }))).toBe(true)
    expect(isThisComputer(new Headers({ [LOCAL_HEADER]: SECRET.slice(1) }))).toBe(false)
    expect(isThisComputer(new Headers({ [LOCAL_HEADER]: SECRET + 'a' }))).toBe(false)
    expect(isThisComputer(new Headers({ [LOCAL_HEADER]: 'b'.repeat(64) }))).toBe(false)
    expect(isThisComputer(new Headers({ [LOCAL_HEADER]: '' }))).toBe(false)
    expect(isThisComputer(new Headers())).toBe(false)
  })

  it('is false when the door is off, whatever the client wrote', () => {
    process.env.TAZRIM_LOCAL_SECRET = SECRET
    delete process.env.TAZRIM_LOCAL_PORT
    expect(isThisComputer(new Headers({ [LOCAL_HEADER]: SECRET }))).toBe(false)
    process.env.TAZRIM_LOCAL_PORT = '3001'
    delete process.env.TAZRIM_LOCAL_SECRET
    expect(isThisComputer(new Headers({ [LOCAL_HEADER]: '' }))).toBe(false)
    expect(isThisComputer(new Headers({ [LOCAL_HEADER]: 'undefined' }))).toBe(false)
  })

  it('spoofed Host and X-Forwarded-For from another device are not this computer', () => {
    on()
    const spoofed = new Headers({ host: 'localhost:3000', 'x-forwarded-host': 'localhost:3000', 'x-forwarded-for': '127.0.0.1', 'x-real-ip': '127.0.0.1', [LOCAL_HEADER]: 'guess' })
    expect(isThisComputer(spoofed)).toBe(false)
    // The older header test still says local for these (installs without the door rely on the publish)
    expect(isLocalRequest(spoofed)).toBe(true)
  })

  it('isLocalRequest is true through the door even when the headers look remote', () => {
    on()
    const viaDocker = new Headers({ host: 'localhost:3000', 'x-forwarded-for': '192.168.65.1', [LOCAL_HEADER]: SECRET })
    expect(isLocalRequest(viaDocker)).toBe(true)
    expect(isLocalRequest(new Headers({ host: 'localhost:3000', 'x-forwarded-for': '192.168.65.1' }))).toBe(false)
  })
})
