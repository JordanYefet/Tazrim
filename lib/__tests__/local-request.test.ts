import { describe, expect, it } from 'vitest'
import { isLocalRequest, isLoopbackHost } from '../local-request'

// Addresses below are loopback, private-range or documentation (RFC 5737 / 3849) examples.

const h = (init: Record<string, string>) => new Headers(init)

/** What Next.js sets on a plain `curl http://localhost:3000/...` */
const nextLocal = (host = 'localhost:3000', ip = '127.0.0.1') =>
  h({ host, 'x-forwarded-host': host, 'x-forwarded-for': ip, 'x-forwarded-port': '3000', 'x-forwarded-proto': 'http' })

describe('isLoopbackHost', () => {
  it.each([
    'localhost',
    'localhost:3000',
    'LOCALHOST:3000',
    ' localhost ',
    '127.0.0.1',
    '127.0.0.1:3003',
    '127.1.2.3',
    '127.255.255.255:80',
    '::1',
    '[::1]',
    '[::1]:3000',
    '0:0:0:0:0:0:0:1',
    '[0000:0000:0000:0000:0000:0000:0000:0001]:3000',
    '::ffff:127.0.0.1',
    '[::ffff:127.0.0.1]:3000',
    '::ffff:7f00:1',
    '::1%lo0',
  ])('accepts %s', v => expect(isLoopbackHost(v)).toBe(true))

  it.each([
    '',
    ' ',
    'example.com',
    'example.com:3000',
    'localhost.example.com',
    'evil-localhost',
    'my.localhost',
    '192.168.1.10',
    '192.168.1.10:3000',
    '10.0.0.1',
    '0.0.0.0',
    '203.0.113.9',
    '128.0.0.1',
    '127.0.0',
    '127.0.0.256',
    '127.0.0.1.example.com',
    '127.0.0.1:',
    '127.0.0.1:abc',
    'localhost:3000:1',
    '::',
    '::2',
    '[::2]:3000',
    '2001:db8::1',
    '[2001:db8::1]:3000',
    '::ffff:192.168.1.10',
    '::ffff:10.0.0.1',
    '[::1',
    '[::1]x',
    '[::1]:',
    '1::1::1',
    '::1:1:1:1:1:1:1:1',
    'ffff::1',
  ])('refuses %j', v => expect(isLoopbackHost(v)).toBe(false))
})

describe('isLocalRequest', () => {
  it('allows what Next sets for a direct local request', () => {
    expect(isLocalRequest(nextLocal())).toBe(true)
    expect(isLocalRequest(nextLocal('127.0.0.1:3003'))).toBe(true)
    expect(isLocalRequest(nextLocal('[::1]:3000', '::1'))).toBe(true)
    expect(isLocalRequest(nextLocal('localhost:3000', '::ffff:127.0.0.1'))).toBe(true)
  })

  it('allows a bare Host with no forwarding headers', () => {
    expect(isLocalRequest(h({ host: 'localhost' }))).toBe(true)
  })

  it('allows local-only lists', () => {
    expect(
      isLocalRequest(h({ host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1, ::1', 'x-forwarded-host': 'localhost:3000,127.0.0.1' }))
    ).toBe(true)
  })

  it('refuses a missing or remote Host', () => {
    expect(isLocalRequest(h({}))).toBe(false)
    expect(isLocalRequest(h({ 'x-forwarded-for': '127.0.0.1' }))).toBe(false)
    expect(isLocalRequest(nextLocal('tazrim.example.com'))).toBe(false)
    expect(isLocalRequest(nextLocal('192.168.1.10:3000'))).toBe(false)
  })

  it('refuses any Forwarded header, even one that claims to be local', () => {
    const headers = nextLocal()
    headers.set('forwarded', 'for=127.0.0.1;host=localhost')
    expect(isLocalRequest(headers)).toBe(false)
    expect(isLocalRequest(h({ host: 'localhost', forwarded: '' }))).toBe(false)
  })

  it('refuses a remote x-forwarded-for (a tunnel that rewrites Host to localhost)', () => {
    expect(isLocalRequest(nextLocal('localhost:3000', '203.0.113.9'))).toBe(false)
    expect(isLocalRequest(nextLocal('localhost:3000', '192.168.1.20'))).toBe(false)
    expect(isLocalRequest(nextLocal('localhost:3000', '2001:db8::7'))).toBe(false)
  })

  it('refuses mixed lists where any entry is remote', () => {
    expect(isLocalRequest(nextLocal('localhost:3000', '203.0.113.9, 127.0.0.1'))).toBe(false)
    expect(isLocalRequest(nextLocal('localhost:3000', '127.0.0.1, 203.0.113.9'))).toBe(false)
    expect(isLocalRequest(nextLocal('localhost:3000', '127.0.0.1,'))).toBe(false)
    expect(
      isLocalRequest(h({ host: 'localhost:3000', 'x-forwarded-host': 'localhost:3000, tazrim.example.com', 'x-forwarded-for': '127.0.0.1' }))
    ).toBe(false)
  })

  it('refuses a remote x-forwarded-host or x-real-ip', () => {
    expect(isLocalRequest(h({ host: 'localhost:3000', 'x-forwarded-host': 'tazrim.example.com' }))).toBe(false)
    expect(isLocalRequest(h({ host: 'localhost:3000', 'x-real-ip': '203.0.113.9' }))).toBe(false)
    expect(isLocalRequest(h({ host: 'localhost:3000', 'x-forwarded-for': '' }))).toBe(false)
  })
})
