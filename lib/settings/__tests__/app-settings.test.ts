/**
 * App settings (ENG-120) against a real migrated database: env > database > default,
 * validation, and that a write is seen at once by the synchronous readers.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

let db: TestDb
let s: typeof import('../app-settings')

const ENV = ['TAZRIM_TZ', 'TAZRIM_VAULT_IDLE_MINUTES', 'TAZRIM_SYNC_CONCURRENCY', 'TAZRIM_ORIGINS', 'TAZRIM_REQUIRE_HTTPS']
const baseTz = process.env.TZ

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  s = await import('../app-settings')
})
beforeEach(async () => {
  db.exec(`DELETE FROM "Setting" WHERE key LIKE 'app.%'`)
  for (const k of ENV) delete process.env[k]
  s.resetAppSettingsCache()
  await s.loadAppSettings()
})
afterEach(() => {
  if (baseTz === undefined) delete process.env.TZ
  else process.env.TZ = baseTz
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('defaults', () => {
  it('a fresh install with no .env is today\'s behaviour', () => {
    expect(s.getTimeZone()).toBe('Asia/Jerusalem')
    expect(s.getVaultIdleMinutes()).toBe(15)
    expect(s.getSyncConcurrency()).toBe(3)
    expect(s.getOrigins()).toEqual([])
    expect(s.getRequireHttps()).toBe(false)
  })
})

describe('precedence', () => {
  it('the database beats the default, and a write is seen at once', async () => {
    await s.setAppSetting('syncConcurrency', 5)
    expect(s.getSyncConcurrency()).toBe(5)
    await s.setAppSetting('requireHttps', true)
    expect(s.getRequireHttps()).toBe(true)
    await s.setAppSetting('vaultIdleMinutes', '30')
    expect(s.getVaultIdleMinutes()).toBe(30)
  })

  it('the environment beats the database, and locks the value', async () => {
    await s.setAppSetting('syncConcurrency', 5)
    process.env.TAZRIM_SYNC_CONCURRENCY = '2'
    expect(s.getSyncConcurrency()).toBe(2)
    expect((await s.getAppSettingsView()).syncConcurrency).toEqual({ value: 2, locked: true })
    await expect(s.setAppSetting('syncConcurrency', 4)).rejects.toMatchObject({ code: 'LOCKED' })
  })

  it('an empty variable (compose passes them empty) is not set', async () => {
    process.env.TAZRIM_TZ = ''
    process.env.TAZRIM_REQUIRE_HTTPS = '  '
    await s.setAppSetting('requireHttps', true)
    const view = await s.getAppSettingsView()
    expect(view.timeZone.locked).toBe(false)
    expect(view.requireHttps).toEqual({ value: true, locked: false })
  })

  it('an invalid variable falls through to the database, then the default', async () => {
    process.env.TAZRIM_SYNC_CONCURRENCY = 'nonsense'
    expect(s.getSyncConcurrency()).toBe(3)
    await s.setAppSetting('vaultIdleMinutes', 45)
    process.env.TAZRIM_VAULT_IDLE_MINUTES = '-4'
    expect(s.getVaultIdleMinutes()).toBe(45)
  })

  it('the environment origins and https flag read like the old variables', () => {
    process.env.TAZRIM_ORIGINS = 'https://A.example.com/, http://192.168.1.5:3000'
    expect(s.getOrigins()).toEqual(['https://a.example.com', 'http://192.168.1.5:3000'])
    process.env.TAZRIM_REQUIRE_HTTPS = 'true'
    expect(s.getRequireHttps()).toBe(true)
    process.env.TAZRIM_REQUIRE_HTTPS = '0'
    expect(s.getRequireHttps()).toBe(false)
  })

  it('removing a value (null) goes back to the default', async () => {
    await s.setAppSetting('syncConcurrency', 6)
    await s.setAppSetting('syncConcurrency', null)
    expect(s.getSyncConcurrency()).toBe(3)
    await s.setAppSetting('origins', 'http://x.example')
    await s.setAppSetting('origins', '')
    expect(s.getOrigins()).toEqual([])
  })
})

describe('validation', () => {
  it('time zones must be real IANA zones', async () => {
    expect(s.isValidTimeZone('Europe/London')).toBe(true)
    expect(s.isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(s.isValidTimeZone('')).toBe(false)
    await expect(s.setAppSetting('timeZone', 'Mars/Olympus')).rejects.toMatchObject({ code: 'INVALID' })
  })

  it('minutes and concurrency are whole numbers in range', async () => {
    for (const bad of [0, 9, 2.5, 'abc', '', '1e1']) await expect(s.setAppSetting('syncConcurrency', bad)).rejects.toMatchObject({ code: 'INVALID' })
    for (const bad of [0, 1441, -1, 'x']) await expect(s.setAppSetting('vaultIdleMinutes', bad)).rejects.toMatchObject({ code: 'INVALID' })
    await s.setAppSetting('syncConcurrency', 8)
    await s.setAppSetting('vaultIdleMinutes', 1440)
    expect(s.getSyncConcurrency()).toBe(8)
  })

  it('origins are a comma list of http(s) origins, normalised', async () => {
    expect(s.parseOrigins('HTTPS://Tazrim.Example.com/ , http://10.0.0.2:3000,https://tazrim.example.com')).toBe('https://tazrim.example.com,http://10.0.0.2:3000')
    for (const bad of ['tazrim.example.com', 'ftp://x.example', 'https://x.example/path', 'https://u:p@x.example', 'https://a.example, nope']) {
      expect(s.parseOrigins(bad)).toBeNull()
    }
    await expect(s.setAppSetting('origins', 'nope')).rejects.toMatchObject({ code: 'INVALID' })
    await s.setAppSetting('origins', 'https://Tazrim.example.com/')
    expect(s.getOrigins()).toEqual(['https://tazrim.example.com'])
  })
})

describe('time zone', () => {
  it('assigning it shifts what the process prints', async () => {
    process.env.TZ = 'UTC'
    const d = new Date('2026-01-15T12:00:00Z')
    expect(d.getTimezoneOffset()).toBe(0)
    await s.setAppSetting('timeZone', 'Asia/Jerusalem')
    expect(d.getTimezoneOffset()).toBe(-120)
    await s.setAppSetting('timeZone', 'America/New_York')
    expect(d.getTimezoneOffset()).toBe(300)
  })

  it('applyTimeZone uses the environment over the database', async () => {
    await s.setAppSetting('timeZone', 'Europe/London')
    process.env.TAZRIM_TZ = 'Asia/Tokyo'
    expect(s.applyTimeZone()).toBe('Asia/Tokyo')
    expect(process.env.TZ).toBe('Asia/Tokyo')
  })
})
