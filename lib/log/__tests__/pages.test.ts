import { beforeEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { entriesAfter, resetLog } from '../buffer'
import { describePageRequest, installPageLog } from '../pages'

beforeEach(resetLog)

describe('describePageRequest', () => {
  it('names a page with its query, without _rsc, and marks a navigation', () => {
    expect(describePageRequest('GET', '/bank?year=2026&month=3')).toEqual({ page: 'GET /bank?year=2026&month=3', kind: 'page', query: { year: '2026', month: '3' } })
    expect(describePageRequest('GET', '/bank?year=2026&month=4&_rsc=1abc')).toMatchObject({ page: 'GET /bank?year=2026&month=4', kind: 'rsc' })
    expect(describePageRequest('GET', '/cards', { rsc: '1' })).toMatchObject({ page: 'GET /cards', kind: 'rsc' })
  })
  it('skips what is not a page', () => {
    for (const u of ['/_next/static/a.js', '/api/categories', '/logs', '/logs/full', '/favicon.ico', '/icon.png', '/__nextjs_x']) {
      expect(describePageRequest('GET', u)).toBeNull()
    }
    expect(describePageRequest('POST', '/bank')).toBeNull()
    expect(describePageRequest('GET', '/bank', { 'next-router-prefetch': '1' })).toBeNull()
  })
  it('redacts the query it shows', () => {
    expect(describePageRequest('GET', '/search?q=a@b.test')?.page).toBe('GET /search?q=••••')
  })
})

describe('installPageLog', () => {
  it('logs the real status and time of a request on a real http server, once, even if installed twice', async () => {
    installPageLog()
    installPageLog()
    const server = createServer((req, res) => {
      res.statusCode = req.url?.startsWith('/missing') ? 404 : 200
      res.end('ok')
    })
    await new Promise<void>(r => server.listen(0, r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await (await fetch(`${base}/bank?year=2026&month=3&_rsc=x`)).text()
    await (await fetch(`${base}/missing`)).text()
    await (await fetch(`${base}/api/x`)).text()
    await new Promise(r => setTimeout(r, 30))
    server.close()
    const lines = entriesAfter()
    expect(lines.map(l => l.msg.replace(/\d+ms/, 'Nms'))).toEqual(['GET /bank?year=2026&month=3 → 200 · Nms', 'GET /missing → 404 · Nms'])
    expect(lines[0].data).toMatchObject({ page: 'GET /bank?year=2026&month=3', kind: 'rsc', status: 200 })
    expect(lines[1].level).toBe('warn')
  })
})
