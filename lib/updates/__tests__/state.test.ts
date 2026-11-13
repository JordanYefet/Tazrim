import fs from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

let db: TestDb
const dir = () => path.dirname(db.file)
const TOKEN = 'a'.repeat(64)

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))
const HEALTH = { ok: true, helperVersion: '1.0.0', api: 1, updatable: true, image: 'x', runningVersion: '1.0.0' }

/** Stubs fetch: routes by URL path */
function helper(routes: Record<string, () => Promise<Response>>) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const r = routes[new URL(url).pathname]
    return r ? r() : Promise.reject(new Error('unreachable'))
  }))
}

const DONE = {
  kind: 'update', from: '1.0.0', to: '1.2.0', state: 'done', restored: false,
  steps: [{ id: 'backup', state: 'done' }], finishedAt: '2026-11-13T09:20:00.000Z',
  backup: '/data/backups/pre-update-v1.0.0-to-v1.2.0-20261113-091400.db', previousImage: 'sha256:' + 'b'.repeat(64),
}

beforeAll(() => {
  db = createTestDb()
  usePrismaOn(db)
})
beforeEach(async () => {
  db.exec(`DELETE FROM "Setting"; DELETE FROM "UploadHistory";`)
  fs.writeFileSync(path.join(dir(), '.updater-token'), TOKEN)
  ;(await import('../helper')).resetHelperCache()
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const f of ['.updater-token', '.update-status.json', '.updating']) fs.rmSync(path.join(dir(), f), { force: true })
  fs.rmSync(path.join(dir(), 'backups'), { recursive: true, force: true })
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('getUpdateView', () => {
  it('cannot update when the helper is unreachable, and reads the job from the status file', async () => {
    helper({})
    fs.writeFileSync(path.join(dir(), '.update-status.json'), JSON.stringify({ ...DONE, state: 'failed', restored: true }))
    const { getUpdateView } = await import('../state')
    const v = await getUpdateView()
    expect(v.canUpdate).toBe(false)
    expect(v.job?.state).toBe('failed')
    expect(v.job?.restored).toBe(true)
  })

  it('cannot update without a token file', async () => {
    fs.rmSync(path.join(dir(), '.updater-token'))
    helper({ '/v1/health': () => json(HEALTH) })
    const { getUpdateView } = await import('../state')
    expect((await getUpdateView()).canUpdate).toBe(false)
  })

  it('cannot update with another helper api', async () => {
    helper({ '/v1/health': () => json({ ...HEALTH, api: 2 }), '/v1/status': () => json(null) })
    const { getUpdateView } = await import('../state')
    expect((await getUpdateView()).canUpdate).toBe(false)
  })

  it('cannot update when the helper cannot reach Docker', async () => {
    helper({ '/v1/health': () => json({ ...HEALTH, updatable: false, error: 'no socket' }), '/v1/status': () => json(null) })
    const { getUpdateView } = await import('../state')
    const v = await getUpdateView()
    expect(v.canUpdate).toBe(false)
    expect(v.job).toBeNull()
  })

  it('can update when the helper is healthy, sending the token', async () => {
    helper({ '/v1/health': () => json(HEALTH), '/v1/status': () => json(null) })
    const { getUpdateView } = await import('../state')
    const v = await getUpdateView()
    expect(v.canUpdate).toBe(true)
    expect(v.auto).toBe(true)
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('offers no roll back once the pre-update backup is gone', async () => {
    helper({ '/v1/health': () => json(HEALTH), '/v1/status': () => json(DONE) })
    fs.rmSync(path.join(dir(), 'backups'), { recursive: true, force: true })
    const { getUpdateView } = await import('../state')
    expect((await getUpdateView()).lastUpdate?.canRollBack).toBe(false)
  })

  it('records a finished update once, counts what was saved since, and allows a roll back', async () => {
    helper({ '/v1/health': () => json(HEALTH), '/v1/status': () => json(DONE) })
    // the backup sits on the same volume, at the same path, in both containers
    fs.mkdirSync(path.join(dir(), 'backups'), { recursive: true })
    fs.writeFileSync(path.join(dir(), 'backups', path.basename(DONE.backup)), 'fake backup')
    db.exec(`INSERT INTO "UploadHistory" ("id","accountId","fileName","uploadedAt","recordCount") VALUES
      ('u1','acct_leumi','old.xlsx',1700000000000,10),
      ('u2','acct_leumi','new.xlsx',${Date.now()},7);`)
    const { getUpdateView } = await import('../state')
    const v = await getUpdateView()
    expect(v.lastUpdate).toMatchObject({ from: '1.0.0', to: '1.2.0', at: DONE.finishedAt, canRollBack: true, since: { uploads: 1, transactions: 7 } })
    expect(JSON.stringify(v)).not.toContain('/data/backups')
    expect(JSON.stringify(v)).not.toContain('previousImage')
    await getUpdateView()
    expect(db.query(`SELECT * FROM "Setting" WHERE key='updates.last'`)).toHaveLength(1)
  })

  it('forgets the last update once it is rolled back', async () => {
    helper({ '/v1/health': () => json(HEALTH), '/v1/status': () => json(DONE) })
    const { getUpdateView } = await import('../state')
    await getUpdateView()
    helper({ '/v1/health': () => json(HEALTH), '/v1/status': () => json({ ...DONE, kind: 'rollback', from: '1.2.0', to: '1.0.0', finishedAt: '2026-11-13T10:00:00.000Z' }) })
    expect((await getUpdateView()).lastUpdate).toBeNull()
  })

  it('clears a stale updating flag when the helper answers and no job runs', async () => {
    helper({ '/v1/health': () => json(HEALTH), '/v1/status': () => json(null) })
    fs.writeFileSync(path.join(dir(), '.updating'), 'x')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getUpdateView } = await import('../state')
    await getUpdateView()
    expect(fs.existsSync(path.join(dir(), '.updating'))).toBe(false)
  })

  it('keeps the flag while a job runs', async () => {
    helper({ '/v1/health': () => json(HEALTH), '/v1/status': () => json({ ...DONE, state: 'running', finishedAt: undefined }) })
    fs.writeFileSync(path.join(dir(), '.updating'), 'x')
    const { getUpdateView } = await import('../state')
    await getUpdateView()
    expect(fs.existsSync(path.join(dir(), '.updating'))).toBe(true)
  })

  it('does not clear the flag on a stale status file when the helper does not answer the status call', async () => {
    helper({ '/v1/health': () => json(HEALTH) })
    fs.writeFileSync(path.join(dir(), '.update-status.json'), JSON.stringify(DONE))
    fs.writeFileSync(path.join(dir(), '.updating'), 'x')
    const { getUpdateView } = await import('../state')
    const v = await getUpdateView()
    expect(v.job?.state).toBe('done')
    expect(fs.existsSync(path.join(dir(), '.updating'))).toBe(true)
  })

  it('does not call the helper again while it is known to be down, and still reads the status file', async () => {
    helper({})
    fs.writeFileSync(path.join(dir(), '.update-status.json'), JSON.stringify(DONE))
    const { getUpdateView } = await import('../state')
    await getUpdateView()
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    const v = await getUpdateView()
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
    expect(v.job?.state).toBe('done')
  })

  it('keeps the helper error text and paths out of the view', async () => {
    helper({ '/v1/health': () => json(HEALTH), '/v1/status': () => json({ ...DONE, state: 'failed', error: 'Backup failed: docker said secret-ish text' }) })
    const { getUpdateView } = await import('../state')
    const text = JSON.stringify(await getUpdateView())
    expect(text).not.toContain('secret-ish')
    expect(text).toContain('"state":"failed"')
  })
})
