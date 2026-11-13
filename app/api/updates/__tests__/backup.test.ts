import fs from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

let db: TestDb
const dir = () => path.dirname(db.file)
const TOKEN = 'c'.repeat(64)
const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }
const post = (headers: Record<string, string> = auth, body: unknown = { from: '1.0.0', to: '1.2.0' }) =>
  new Request('http://localhost/api/updates/backup', { method: 'POST', headers, body: JSON.stringify(body) })

beforeAll(() => {
  db = createTestDb()
  usePrismaOn(db)
  fs.writeFileSync(path.join(dir(), '.updater-token'), TOKEN)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  fs.rmSync(path.join(dir(), '.updating'), { force: true })
  fs.rmSync(path.join(dir(), 'backups'), { recursive: true, force: true })
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('/api/updates/backup', () => {
  it('answers 401 without the token, or with a wrong one', async () => {
    const { POST, DELETE } = await import('../backup/route')
    expect((await POST(post({ 'content-type': 'application/json' }))).status).toBe(401)
    expect((await POST(post({ authorization: `Bearer ${'d'.repeat(64)}` }))).status).toBe(401)
    expect((await DELETE(new Request('http://localhost/x', { method: 'DELETE' }))).status).toBe(401)
    expect(fs.existsSync(path.join(dir(), '.updating'))).toBe(false)
  })

  it('answers 409 SYNC_RUNNING while a sync runs, without pausing writes', async () => {
    const runs = await import('@/lib/sync/runs')
    vi.spyOn(runs, 'isSyncActive').mockReturnValue(true)
    const { POST } = await import('../backup/route')
    const res = await POST(post())
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SYNC_RUNNING')
    expect(fs.existsSync(path.join(dir(), '.updating'))).toBe(false)
  })

  it('the app names the backup with its own version, whatever the helper thinks it runs', async () => {
    const { CURRENT_VERSION } = await import('@/lib/updates/check')
    const { POST } = await import('../backup/route')
    const esc = CURRENT_VERSION.replace(/\./g, '\\.')
    for (const body of [{ from: 'unknown', to: '1.2.0' }, { to: '1.2.0' }, { from: '0.0.7', to: '1.2.0' }]) {
      const res = await POST(post(auth, body))
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.from).toBe(CURRENT_VERSION)
      expect(path.basename(j.file)).toMatch(new RegExp(`^pre-update-v${esc}-to-v1\\.2\\.0-\\d{8}-\\d{6}\\.db$`))
      fs.rmSync(path.join(dir(), '.updating'), { force: true })
    }
  })

  it('still refuses a bad `to`, or a `from` that is neither x.y.z nor unknown', async () => {
    const { POST } = await import('../backup/route')
    for (const body of [{ from: 'unknown', to: 'unknown' }, { from: '1.0.0' }, { from: '1.0.0; rm -rf /', to: '1.2.0' }]) {
      expect((await POST(post(auth, body))).status).toBe(400)
    }
    expect(fs.existsSync(path.join(dir(), '.updating'))).toBe(false)
  })

  it('takes the backup, sets the flag, and DELETE clears it', async () => {
    const { CURRENT_VERSION } = await import('@/lib/updates/check')
    const { POST, DELETE } = await import('../backup/route')
    const res = await POST(post())
    expect(res.status).toBe(200)
    const { file } = await res.json()
    expect(path.basename(file)).toMatch(new RegExp(`^pre-update-v${CURRENT_VERSION.replace(/\./g, '\\.')}-to-v1\\.2\\.0-\\d{8}-\\d{6}\\.db$`))
    expect(fs.existsSync(file)).toBe(true)
    expect(fs.existsSync(path.join(dir(), '.updating'))).toBe(true)
    const del = await DELETE(new Request('http://localhost/x', { method: 'DELETE', headers: auth }))
    expect(del.status).toBe(200)
    expect(fs.existsSync(path.join(dir(), '.updating'))).toBe(false)
  })

  it('refuses versions that are not x.y.z (they go into a file name)', async () => {
    const { POST } = await import('../backup/route')
    expect((await POST(post(auth, { from: '../x', to: '1.2.0' }))).status).toBe(400)
  })

  it('is public for the session gate', async () => {
    const { isPublicPath } = await import('@/lib/auth/config')
    expect(isPublicPath('/api/updates/backup')).toBe(true)
    expect(isPublicPath('/api/updates')).toBe(false)
    expect(isPublicPath('/api/updates/start')).toBe(false)
  })
})

describe('every route in read-only mode', () => {
  it('answers 403', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '1')
    const req = (m: string) => new Request('http://localhost/x', { method: m, headers: auth, body: m === 'GET' || m === 'DELETE' ? undefined : '{}' })
    expect((await (await import('../route')).GET()).status).toBe(403)
    expect((await (await import('../check/route')).POST()).status).toBe(403)
    expect((await (await import('../auto/route')).PUT(req('PUT'))).status).toBe(403)
    expect((await (await import('../start/route')).POST(req('POST'))).status).toBe(403)
    expect((await (await import('../rollback/route')).POST()).status).toBe(403)
    const b = await import('../backup/route')
    expect((await b.POST(req('POST'))).status).toBe(403)
    expect((await b.DELETE(req('DELETE'))).status).toBe(403)
  })
})
