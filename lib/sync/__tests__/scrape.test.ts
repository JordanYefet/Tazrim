import { describe, expect, it } from 'vitest'
import { chromiumArgs, safeReason, syncProxyArgs } from '../scrape'

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
