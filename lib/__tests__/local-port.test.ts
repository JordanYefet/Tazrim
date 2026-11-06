import { createServer, get, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isLocalRequest } from '../local-request'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startLocalPort } = require('../../docker/local-port.cjs') as {
  startLocalPort: (port: number, target: number, host?: string) => Server
}

// The container's loopback-only port (ENG-100): a stand-in server reports what
// Next.js would see for a request piped through it.

const listening = (s: Server) => new Promise<number>(r => s.on('listening', () => r((s.address() as AddressInfo).port)))

/** GET through the pipe with these headers (fetch can't set Host) */
const through = (headers: Record<string, string>) =>
  new Promise<{ local: boolean; from: string }>((resolve, reject) => {
    get({ host: '127.0.0.1', port: pipePort, path: '/api/sync', headers }, res => {
      let body = ''
      res.on('data', c => (body += c))
      res.on('end', () => resolve(JSON.parse(body)))
    }).on('error', reject)
  })

let app: Server
let pipe: Server
let pipePort: number

beforeAll(async () => {
  app = createServer((req, res) => {
    // Next.js fills x-forwarded-for from the socket when no proxy sent one
    const headers = new Headers(req.headers as Record<string, string>)
    if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress ?? '')
    res.end(JSON.stringify({ local: isLocalRequest(headers), from: req.socket.remoteAddress }))
  }).listen(0, '127.0.0.1')
  const appPort = await listening(app)
  pipe = startLocalPort(0, appPort, '127.0.0.1')
  pipePort = await listening(pipe)
})

afterAll(() => {
  pipe.close()
  app.close()
})

describe('local port', () => {
  it('reaches the server from 127.0.0.1, so a browser on this machine counts as local', async () => {
    expect(await through({ host: 'localhost:3101' })).toEqual({ local: true, from: '127.0.0.1' })
  })

  it('passes the Host through: a remote name is still refused', async () => {
    expect((await through({ host: 'tazrim.example.com' })).local).toBe(false)
  })

  it('passes forwarding headers through untouched: a proxy in front is still refused', async () => {
    expect((await through({ host: 'localhost:3101', 'x-forwarded-for': '203.0.113.9' })).local).toBe(false)
  })
})

describe('the published port without it', () => {
  it('refuses what Docker Desktop delivers: the gateway, for the Mac and the phone alike', () => {
    const viaDocker = (host: string) => new Headers({ host, 'x-forwarded-host': host, 'x-forwarded-for': '::ffff:192.168.65.1' })
    expect(isLocalRequest(viaDocker('localhost:3100'))).toBe(false)
    expect(isLocalRequest(viaDocker('192.168.1.10:3100'))).toBe(false)
  })
})
