import { describe, expect, it } from 'vitest'
import { chromiumArgs, providerProxyArgs, quietBrowserArgs, safeReason, syncProxyArgs } from '../scrape'

// Made-up card digits and messages only.
describe('safeReason', () => {
  it('masks every run of three or more digits, so no card, account or ID number reaches the log', () => {
    expect(safeReason('failed to fetch transactions for card 1234. Message: x')).toBe('failed to fetch transactions for card ###. Message: x')
    expect(safeReason('account 000-123456/00 amount 99')).toBe('account ###-###/00 amount 99')
  })
  it('flattens whitespace and cuts long text', () => {
    expect(safeReason('a\n\n  b')).toBe('a b')
    expect(safeReason('x'.repeat(500))).toHaveLength(300)
    expect(safeReason(undefined)).toBe('')
  })
})

describe('chromiumArgs', () => {
  it('splits the flags on whitespace and drops empties', () => {
    expect(chromiumArgs('--no-sandbox  --disable-dev-shm-usage ')).toEqual(['--no-sandbox', '--disable-dev-shm-usage'])
    expect(chromiumArgs('')).toEqual([])
    expect(chromiumArgs(undefined)).toEqual([])
  })
})

describe('syncProxyArgs', () => {
  it('turns TAZRIM_SYNC_PROXY into the browser flag', () => {
    expect(syncProxyArgs('http://squid:3128')).toEqual(['--proxy-server=http://squid:3128'])
    expect(syncProxyArgs(' http://proxy.example.com:8080/ ')).toEqual(['--proxy-server=http://proxy.example.com:8080'])
  })
  it('adds nothing when unset or empty, so installs without the proxy are unchanged', () => {
    expect(syncProxyArgs(undefined)).toEqual([])
    expect(syncProxyArgs('')).toEqual([])
  })
  it('ignores anything that is not a plain http(s) proxy address (never another browser flag)', () => {
    expect(syncProxyArgs('--no-sandbox')).toEqual([])
    expect(syncProxyArgs('squid:3128')).toEqual([])
    expect(syncProxyArgs('http://squid:3128 --disable-web-security')).toEqual([])
    expect(syncProxyArgs('socks5://squid:1080')).toEqual([])
  })
})

describe('providerProxyArgs (ENG-142)', () => {
  it('the browser of a company uses that company\'s own port on the same host', () => {
    expect(providerProxyArgs('http://squid:3128', 'leumi')).toEqual(['--proxy-server=http://squid:3212'])
    expect(providerProxyArgs('http://squid:3128/', 'visaCal')).toEqual(['--proxy-server=http://squid:3206'])
    expect(providerProxyArgs('http://squid:3128', 'max')).toEqual(['--proxy-server=http://squid:3207'])
  })
  it('nothing without TAZRIM_SYNC_PROXY, and a proxy that is not our Squid port stays as the person wrote it', () => {
    expect(providerProxyArgs(undefined, 'leumi')).toEqual([])
    expect(providerProxyArgs('', 'leumi')).toEqual([])
    expect(providerProxyArgs('http://proxy.example.com:8080', 'leumi')).toEqual(['--proxy-server=http://proxy.example.com:8080'])
    expect(providerProxyArgs('--no-sandbox', 'leumi')).toEqual([])
  })
  it('a company without a port keeps the proxy as given', () => {
    expect(providerProxyArgs('http://squid:3128', 'unknownBank')).toEqual(['--proxy-server=http://squid:3128'])
  })
})

describe('quietBrowserArgs (ENG-142)', () => {
  it('turns off Chrome\'s own background traffic behind the proxy, and adds nothing without one', () => {
    const args = quietBrowserArgs('http://squid:3128')
    expect(args).toEqual(expect.arrayContaining(['--disable-component-update', '--no-pings', '--disable-domain-reliability']))
    expect(args.join(' ')).toContain('--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter,Translate')
    expect(quietBrowserArgs(undefined)).toEqual([])
    expect(quietBrowserArgs('nonsense')).toEqual([])
  })
})
