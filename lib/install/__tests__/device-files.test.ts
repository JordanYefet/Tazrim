import { readFileSync } from 'node:fs'
import path from 'node:path'
import { X509Certificate } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMobileconfig, cleanPem, pemBody, readRootCert } from '../device-files'
import { privateAddresses } from '../network'
import { httpsAddress, isHttpsOn, phoneAddress, withHttps } from '../addresses'

// A throwaway self-signed certificate (CN "Fake Test Root (not a real CA)"), laid out like Caddy's data folder
const FIXTURES = path.join(__dirname, 'fixtures')
const PEM = readFileSync(path.join(FIXTURES, 'caddy/pki/authorities/local/root.crt'), 'utf8')
const KEY = '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIFakeFakeFakeFakeFakeFakeFakeFakeFakeFakeoAoGCCqGSM49\n-----END EC PRIVATE KEY-----\n'

describe('pemBody / cleanPem', () => {
  it('gives the certificate as the base64 of its DER', () => {
    const body = pemBody(PEM)!
    expect(Buffer.from(body, 'base64').equals(new X509Certificate(PEM).raw)).toBe(true)
  })

  it('keeps only the certificate: no key, nothing around it', () => {
    const out = cleanPem(`${KEY}junk\n${PEM}more junk`)!
    expect(out).not.toContain('PRIVATE KEY')
    expect(out.startsWith('-----BEGIN CERTIFICATE-----\n')).toBe(true)
    expect(new X509Certificate(out).subject).toContain('Fake Test Root')
  })

  it('refuses what is not a certificate', () => {
    expect(pemBody('')).toBeNull()
    expect(pemBody(KEY)).toBeNull()
    expect(pemBody('-----BEGIN CERTIFICATE-----\n<script>\n-----END CERTIFICATE-----')).toBeNull()
  })
})

describe('buildMobileconfig', () => {
  const base = { certPem: PEM, lanIp: '192.168.1.20', dnsHost: 'dns.internal', httpsPort: '443' }

  it('holds the root certificate and DNS over HTTPS for .internal', () => {
    const p = buildMobileconfig(base)!
    expect(p).toContain('<key>PayloadType</key><string>com.apple.security.root</string>')
    expect(p).toContain(`<data>${pemBody(PEM)}</data>`)
    expect(p).toContain('<string>https://dns.internal/dns-query/phones</string>')
    expect(p).toContain('<array><string>192.168.1.20</string></array>')
    expect(p).toContain('<array><string>internal</string></array>')
    expect(p.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })

  it('puts a port other than 443 in the DNS address', () => {
    expect(buildMobileconfig({ ...base, httpsPort: '8443' })).toContain('https://dns.internal:8443/dns-query/phones')
  })

  it('without this computer’s address: the certificate only', () => {
    const p = buildMobileconfig({ ...base, lanIp: '' })!
    expect(p).toContain('com.apple.security.root')
    expect(p).not.toContain('dnsSettings')
  })

  it('never takes a bad host or address into the profile', () => {
    const p = buildMobileconfig({ ...base, lanIp: '1.2.3.4</string>', dnsHost: '<x>.internal' })!
    expect(p).not.toContain('<x>')
    expect(p).not.toContain('1.2.3.4')
  })

  it('no profile without a certificate', () => {
    expect(buildMobileconfig({ ...base, certPem: 'nope' })).toBeNull()
  })
})

describe('readRootCert', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads Caddy’s data folder when TAZRIM_CADDY_DATA is set', async () => {
    expect(await readRootCert({ TAZRIM_CADDY_DATA: FIXTURES } as unknown as NodeJS.ProcessEnv)).toBe(cleanPem(PEM))
    expect(await readRootCert({ TAZRIM_CADDY_DATA: '/nowhere' } as unknown as NodeJS.ProcessEnv)).toBeNull()
  })

  it('otherwise asks Caddy on the Docker network for /root.crt', async () => {
    const fetchMock = vi.fn(async () => new Response(PEM))
    vi.stubGlobal('fetch', fetchMock)
    expect(await readRootCert({} as unknown as NodeJS.ProcessEnv)).toBe(cleanPem(PEM))
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('http://caddy:2016/root.crt')
  })

  it('no certificate when Caddy is off or answers something else', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND') }))
    expect(await readRootCert({} as unknown as NodeJS.ProcessEnv)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })))
    expect(await readRootCert({} as unknown as NodeJS.ProcessEnv)).toBeNull()
  })
})

describe('addresses', () => {
  it('the phone address needs this computer’s address', () => {
    expect(phoneAddress({ TAZRIM_LAN_IP: '192.168.1.20', TAZRIM_PHONE_PORT: '3001' })).toBe('http://192.168.1.20:3001')
    expect(phoneAddress({ TAZRIM_LAN_IP: '', TAZRIM_PHONE_PORT: '3001' })).toBeNull()
  })

  it('the HTTPS address shows a port only when it isn’t 443', () => {
    expect(httpsAddress('tazrim.internal', '443')).toBe('https://tazrim.internal')
    expect(httpsAddress('tazrim.internal', '8443')).toBe('https://tazrim.internal:8443')
  })

  it('only private IPv4 addresses of the computer are offered', () => {
    const nic = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false) => ({ address, family, internal, netmask: '', mac: '', cidr: null }) as never
    expect(
      privateAddresses({ lo0: [nic('127.0.0.1', 'IPv4', true)], en0: [nic('192.168.1.20'), nic('fe80::1', 'IPv6')], utun: [nic('100.64.0.2')], en1: [nic('10.0.0.5'), nic('192.168.1.20')] })
    ).toEqual(['192.168.1.20', '10.0.0.5'])
  })
})

describe('the HTTPS switch', () => {
  it('turns https and dns on together and keeps the helper', () => {
    expect(withHttps('updater', true, true)).toBe('updater,https,dns')
    expect(withHttps('', true, false)).toBe('https,dns')
    expect(withHttps('', true, true)).toBe('updater,https,dns')
  })

  it('turns both off, keeping everything else', () => {
    expect(withHttps('https,dns,updater', false, true)).toBe('updater')
    expect(withHttps('dns', false, false)).toBe('')
  })

  it('counts as on only with both parts', () => {
    expect(isHttpsOn('updater,https,dns')).toBe(true)
    expect(isHttpsOn('https')).toBe(false)
    expect(isHttpsOn('')).toBe(false)
  })
})
