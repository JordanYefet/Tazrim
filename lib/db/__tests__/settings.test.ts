// lib/db/__tests__/settings.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

let db: TestDb
let settings: typeof import('../settings')

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  settings = await import('../settings')
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('cushion setting', () => {
  it('is 0 until set', async () => {
    expect(await settings.getCushion()).toBe(0)
  })

  it('stores a non-negative amount', async () => {
    expect(await settings.setCushion(2500)).toBe(2500)
    expect(await settings.getCushion()).toBe(2500)
    expect(await settings.setCushion('3000')).toBe(3000)
  })

  it.each([[-1], ['abc'], [''], [null], [Number.NaN], [100_000_001]])('rejects %s and keeps the stored value', async bad => {
    await settings.setCushion(1200)
    await expect(settings.setCushion(bad)).rejects.toThrow(settings.SettingValidationError)
    expect(await settings.getCushion()).toBe(1200)
  })

  it('reads a broken stored value as 0', async () => {
    db.exec(`INSERT OR REPLACE INTO "Setting" ("key","value") VALUES ('projection.cushion','oops');`)
    expect(await settings.getCushion()).toBe(0)
  })
})