import fs from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

let db: TestDb

beforeAll(() => {
  db = createTestDb()
  usePrismaOn(db)
  db.exec(`CREATE TABLE "Fake" ("id" INTEGER PRIMARY KEY, "name" TEXT); INSERT INTO "Fake" ("name") VALUES ('a'), ('b'), ('c');`)
})
afterEach(() => {
  fs.rmSync(path.join(path.dirname(db.file), 'backups'), { recursive: true, force: true })
  fs.rmSync(path.join(path.dirname(db.file), '.updating'), { force: true })
  vi.unstubAllEnvs()
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('dataDir', () => {
  it('is the folder of the database file in TAZRIM_DATABASE_URL', async () => {
    const { dataDir } = await import('../paths')
    expect(dataDir()).toBe(path.dirname(db.file))
    vi.stubEnv('TAZRIM_DATABASE_URL', 'file:/data/tazrim.db')
    expect(dataDir()).toBe('/data')
  })

  it('resolves a relative file: URL against prisma/, as Prisma does, and defaults to prisma/', async () => {
    const { dataDir } = await import('../paths')
    const prismaDir = path.resolve(process.cwd(), 'prisma')
    vi.stubEnv('TAZRIM_DATABASE_URL', 'file:./other.db')
    expect(dataDir()).toBe(prismaDir)
    vi.stubEnv('TAZRIM_DATABASE_URL', '')
    expect(dataDir()).toBe(prismaDir)
  })
})

describe('takeBackup', () => {
  const NOW = new Date(2026, 10, 13, 9, 14, 0)

  it('writes a valid copy named for the versions and the time', async () => {
    const { takeBackup } = await import('../backup')
    const file = await takeBackup('1.0.0', '1.2.0', NOW)
    expect(path.isAbsolute(file)).toBe(true)
    expect(file).toBe(path.join(path.dirname(db.file), 'backups', 'pre-update-v1.0.0-to-v1.2.0-20261113-091400.db'))
    const out = JSON.parse(
      (await import('node:child_process')).execFileSync('sqlite3', ['-json', file, 'SELECT COUNT(*) AS n FROM "Fake"']).toString()
    )
    expect(out[0].n).toBe(3)
  })

  it('keeps only the newest 5 pre-update backups', async () => {
    const { takeBackup } = await import('../backup')
    const dir = path.join(path.dirname(db.file), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    for (let i = 1; i <= 6; i++) fs.writeFileSync(path.join(dir, `pre-update-v1.0.${i}-to-v1.0.${i + 1}-2026110${i}-000000.db`), 'x')
    fs.writeFileSync(path.join(dir, 'manual.db'), 'x')
    await takeBackup('1.0.7', '1.0.8', NOW)
    const left = fs.readdirSync(dir).filter(f => f.startsWith('pre-update-')).sort()
    expect(left).toHaveLength(5)
    expect(left).not.toContain('pre-update-v1.0.1-to-v1.0.2-20261101-000000.db')
    expect(left).not.toContain('pre-update-v1.0.2-to-v1.0.3-20261102-000000.db')
    expect(left).toContain('pre-update-v1.0.7-to-v1.0.8-20261113-091400.db')
    expect(fs.existsSync(path.join(dir, 'manual.db'))).toBe(true)
  })
})

describe('pruneBackups', () => {
  it('returns what it deleted, and nothing when there is no folder', async () => {
    const { pruneBackups } = await import('../backup')
    expect(await pruneBackups()).toEqual([])
    const dir = path.join(path.dirname(db.file), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    for (let i = 1; i <= 3; i++) fs.writeFileSync(path.join(dir, `pre-update-v1.0.0-to-v1.0.1-2026110${i}-000000.db`), 'x')
    expect(await pruneBackups(2)).toEqual([path.join(dir, 'pre-update-v1.0.0-to-v1.0.1-20261101-000000.db')])
  })
})

describe('the updating flag', () => {
  it('is a file in the data folder', async () => {
    const { isUpdating, setUpdating } = await import('../paths')
    expect(isUpdating()).toBe(false)
    setUpdating(true)
    expect(fs.existsSync(path.join(path.dirname(db.file), '.updating'))).toBe(true)
    expect(isUpdating()).toBe(true)
    setUpdating(false)
    expect(isUpdating()).toBe(false)
    setUpdating(false)
  })

  it('older than 15 minutes is stale: removed (and logged), so a dead helper cannot pause saving for good', async () => {
    const { isUpdating, setUpdating } = await import('../paths')
    const flag = path.join(path.dirname(db.file), '.updating')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setUpdating(true)
    const old = new Date(Date.now() - 16 * 60 * 1000)
    fs.utimesSync(flag, old, old)
    expect(isUpdating()).toBe(false)
    expect(fs.existsSync(flag)).toBe(false)
    expect(warn).toHaveBeenCalled()
    setUpdating(true)
    const recent = new Date(Date.now() - 14 * 60 * 1000)
    fs.utimesSync(flag, recent, recent)
    expect(isUpdating()).toBe(true)
    warn.mockRestore()
  })
})

