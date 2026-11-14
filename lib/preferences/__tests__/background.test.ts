import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

// The page background follows the person, not the device. Made-up people only.

const MIGRATION = '20261114000000_person_preferences'

describe(`${MIGRATION} migration`, () => {
  it('adds PersonPreference, and down.sql removes it with every other table intact', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      const tables = () => db.query<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      const before = tables()
      const migrationsBefore = db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)
      db.applyMigration(MIGRATION)
      expect(tables().map(t => t.name)).toContain('PersonPreference')
      db.applyDown(MIGRATION)
      expect(tables()).toEqual(before)
      expect(db.query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`)).toEqual(migrationsBefore)
    } finally {
      db.cleanup()
    }
  })
})

describe('stored background', () => {
  let db: TestDb
  let prefs: typeof import('../background')

  beforeAll(async () => {
    db = createTestDb()
    db.exec(`INSERT INTO "Person" ("id","name","createdAt") VALUES ('p_fake_a','Fake A',1900000000000), ('p_fake_b','Fake B',1900000000000);`)
    usePrismaOn(db)
    prefs = await import('../background')
  })
  afterAll(async () => {
    await releasePrisma()
    db.cleanup()
  })

  it('nothing stored: null, so the device cookie decides', async () => {
    expect(await prefs.getStoredBackground('p_fake_a')).toBeNull()
    expect(await prefs.getStoredBackground(null)).toBeNull()
  })

  it('each person keeps their own, and a change replaces it', async () => {
    await prefs.storeBackground('p_fake_a', { kind: 'aurora', strength: 10, palette: 'indigo-pink' })
    await prefs.storeBackground('p_fake_b', { kind: 'lines', strength: 22, palette: 'ocean' })
    await prefs.storeBackground('p_fake_a', { kind: 'grid', strength: 10, palette: 'indigo-pink' })
    expect(await prefs.getStoredBackground('p_fake_a')).toEqual({ kind: 'grid', strength: 10, palette: 'indigo-pink' })
    expect(await prefs.getStoredBackground('p_fake_b')).toEqual({ kind: 'lines', strength: 22, palette: 'ocean' })
  })

  it('without sign-in (null person) one background for the household, in Setting', async () => {
    await prefs.storeBackground(null, { kind: 'waves', strength: 10, palette: 'grey' })
    expect(await prefs.getStoredBackground(null)).toEqual({ kind: 'waves', strength: 10, palette: 'grey' })
    expect(db.query(`SELECT key FROM "Setting" WHERE key = 'background'`)).toEqual([{ key: 'background' }])
  })

  it('a person removed takes their background with them', async () => {
    const { prisma } = await import('@/lib/db/client')
    await prisma.person.delete({ where: { id: 'p_fake_b' } })
    expect(db.query(`SELECT * FROM "PersonPreference" WHERE personId = 'p_fake_b'`)).toEqual([])
  })
})
