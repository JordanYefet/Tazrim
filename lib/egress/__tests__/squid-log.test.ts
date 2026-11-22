import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TAIL_BYTES, blockedDuring, hostOf, parseDenied, parseDeniedLines, readTail, recentDenied, whoIs } from '../squid-log'

const line = (t: number, client: string, code: string, method: string, url: string) => `${t.toFixed(3)}     12 ${client} ${code} 3922 ${method} ${url} - HIER_NONE/- text/html`
const T = 1_790_000_000

let dir: string
let file: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-log-'))
  file = path.join(dir, 'access.log')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('parseDenied', () => {
  it('reads a refused CONNECT: time, who, host without the port', () => {
    expect(parseDenied(line(T, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', 'Tracker.example.test:443'))).toEqual({ at: T * 1000, who: 'app', host: 'tracker.example.test' })
  })
  it('reads the host of a plain URL', () => {
    expect(parseDenied(line(T, '172.31.2.9', 'TCP_DENIED/403', 'GET', 'http://ads.example.test/x?y=1'))).toMatchObject({ who: 'updater', host: 'ads.example.test' })
  })
  it('ignores allowed requests, other refusals and garbage', () => {
    expect(parseDenied(line(T, '172.31.1.5', 'TCP_TUNNEL/200', 'CONNECT', 'bank.example.test:443'))).toBeNull()
    expect(parseDenied(line(T, '172.31.1.5', 'TCP_DENIED/407', 'CONNECT', 'x.example.test:443'))).toBeNull()
    expect(parseDenied('not a log line')).toBeNull()
    expect(parseDenied('')).toBeNull()
    expect(parseDenied(line(NaN, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', 'x.example.test:443'))).toBeNull()
  })
  it('who by network', () => {
    expect(whoIs('172.31.1.200')).toBe('app')
    expect(whoIs('172.31.2.2')).toBe('updater')
    expect(whoIs('172.31.3.2')).toBe('other')
  })
  it('hostOf', () => {
    expect(hostOf('CONNECT', 'a.b.test:8443')).toBe('a.b.test')
    expect(hostOf('GET', 'not a url')).toBeNull()
  })
})

describe('parseDeniedLines', () => {
  it('newest first, refusals only, capped', () => {
    const text = [
      line(T, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', 'a.example.test:443'),
      line(T + 1, '172.31.1.5', 'TCP_TUNNEL/200', 'CONNECT', 'bank.example.test:443'),
      line(T + 2, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', 'b.example.test:443'),
      line(T + 3, '172.31.2.5', 'TCP_DENIED/403', 'CONNECT', 'c.example.test:443'),
    ].join('\n')
    expect(parseDeniedLines(text).map(d => d.host)).toEqual(['c.example.test', 'b.example.test', 'a.example.test'])
    expect(parseDeniedLines(text, 2).map(d => d.host)).toEqual(['c.example.test', 'b.example.test'])
  })
})

describe('readTail', () => {
  it('reads only the end of a big file and drops the line it cut', () => {
    const rows = Array.from({ length: 20000 }, (_, i) => line(T + i, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', `h${i}.example.test:443`))
    fs.writeFileSync(file, rows.join('\n') + '\n')
    const text = readTail(file)
    expect(text.length).toBeLessThanOrEqual(TAIL_BYTES)
    const first = text.split('\n')[0]
    expect(first).toMatch(/^\d+\.\d{3} /)
    expect(text).toContain('h19999.example.test')
    expect(text).not.toContain('h0.example.test')
  })
  it('a missing file is empty, not an error', () => {
    expect(readTail(path.join(dir, 'none.log'))).toBe('')
    expect(recentDenied(50, path.join(dir, 'none.log'))).toEqual([])
  })
})

describe('blockedDuring', () => {
  it('the hosts the app was refused inside the window, once each; never the updater or other times', () => {
    fs.writeFileSync(
      file,
      [
        line(T - 60, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', 'before.example.test:443'),
        line(T + 5, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', 'captcha.example.test:443'),
        line(T + 6, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', 'captcha.example.test:443'),
        line(T + 7, '172.31.2.5', 'TCP_DENIED/403', 'CONNECT', 'updater-only.example.test:443'),
        line(T + 8, '172.31.1.5', 'TCP_TUNNEL/200', 'CONNECT', 'bank.example.test:443'),
        line(T + 9, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', 'bot.example.test:443'),
        line(T + 600, '172.31.1.5', 'TCP_DENIED/403', 'CONNECT', 'after.example.test:443'),
      ].join('\n')
    )
    expect(blockedDuring(T * 1000, (T + 10) * 1000, file)).toEqual(['captcha.example.test', 'bot.example.test'])
    expect(blockedDuring((T + 100) * 1000, (T + 110) * 1000, file)).toEqual([])
  })
})
