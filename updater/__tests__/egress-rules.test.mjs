import { describe, expect, it } from 'vitest'
import { checkDomain, covers, SHARED_HOSTS } from '../egress-rules.mjs'

describe('covers', () => {
  it('a leading dot covers the domain and its subdomains, no dot only itself', () => {
    expect(covers('.example.com', 'example.com')).toBe(true)
    expect(covers('.example.com', 'a.b.example.com')).toBe(true)
    expect(covers('.example.com', 'notexample.com')).toBe(false)
    expect(covers('example.com', 'a.example.com')).toBe(false)
    expect(covers('example.com', 'example.com')).toBe(true)
  })
})

describe('checkDomain', () => {
  it('normalises case and whitespace, keeps the leading dot', () => {
    expect(checkDomain('  .Bank-Example.CO.il ')).toEqual({ ok: true, domain: '.bank-example.co.il' })
    expect(checkDomain('www.example.com')).toEqual({ ok: true, domain: 'www.example.com' })
  })

  it('refuses what is not a plain host name', () => {
    for (const bad of ['', 'localhost', 'https://example.com', 'example.com/path', 'example.com:443', '*.example.com', '1.2.3.4', '.1.2.3.4', '[::1]', 'exa mple.com', 'a..com', 42, null, undefined, 'x'.repeat(300) + '.com']) {
      expect(checkDomain(bad), String(bad)).toEqual({ ok: false, code: 'BAD_DOMAIN' })
    }
  })

  it('refuses a bare TLD or public suffix, with or without the dot', () => {
    for (const d of ['.il', 'co.il', '.co.il', '.org.il', '.gov.il', '.com', 'net', '.io']) {
      expect(checkDomain(d), d).toEqual({ ok: false, code: 'TOO_BROAD' })
    }
  })

  it('refuses shared hosts, anything under one, and anything covering one', () => {
    expect(checkDomain('github.com')).toEqual({ ok: false, code: 'SHARED_HOST' })
    expect(checkDomain('.bucket.s3.amazonaws.com')).toEqual({ ok: false, code: 'SHARED_HOST' })
    expect(checkDomain('.amazonaws.com')).toEqual({ ok: false, code: 'SHARED_HOST' })
    expect(checkDomain('.blob.core.windows.net')).toEqual({ ok: false, code: 'SHARED_HOST' })
    // covers drive.google.com
    expect(checkDomain('.google.com')).toEqual({ ok: false, code: 'SHARED_HOST' })
    for (const h of SHARED_HOSTS) expect(checkDomain(h).ok, h).toBe(false)
  })
})
