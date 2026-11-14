import { prisma } from '@/lib/db/client'

/**
 * App settings that used to live only in `.env` (ENG-120). Precedence per value:
 * the environment variable when set (non-empty) > the database (`Setting` table) > the default.
 *
 * The readers on hot paths (every sign-in, the vault's idle lock) are synchronous, so the
 * values are kept in memory: loaded once at start (instrumentation.ts), reloaded after
 * every write here, and in the background when older than STALE_MS (a restored database).
 */

export type SettingName = 'timeZone' | 'vaultIdleMinutes' | 'syncConcurrency' | 'origins' | 'requireHttps'

interface Def {
  key: string
  env: string
  /** The stored/env text, or null when it is not valid */
  parse(raw: string): string | null
}

export const DEFAULT_TIME_ZONE = 'Asia/Jerusalem'
export const DEFAULT_VAULT_IDLE_MINUTES = 15
export const DEFAULT_SYNC_CONCURRENCY = 3
export const VAULT_IDLE_RANGE = { min: 1, max: 1440 }
export const SYNC_CONCURRENCY_RANGE = { min: 1, max: 8 }

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz !== tz.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const integerIn = (r: { min: number; max: number }) => (raw: string) => {
  if (!/^\d+$/.test(raw.trim())) return null
  const n = Number(raw)
  return n >= r.min && n <= r.max ? String(n) : null
}

/** One origin: http(s)://host[:port], nothing else; lower-cased */
export function parseOrigin(raw: string): string | null {
  const s = raw.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(s)) return null
  try {
    const u = new URL(s)
    if (u.origin === 'null' || u.pathname !== '/' || u.search || u.hash || u.username || u.password) return null
    return u.origin.toLowerCase()
  } catch {
    return null
  }
}

/** A comma list of origins, normalised; an empty list is valid (any address); null when any entry is bad */
export function parseOrigins(raw: string): string | null {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    const o = parseOrigin(p)
    if (!o) return null
    if (!out.includes(o)) out.push(o)
  }
  return out.join(',')
}

const TRUE = /^(1|true|yes|on)$/i

const DEFS: Record<SettingName, Def> = {
  timeZone: { key: 'app.timeZone', env: 'TAZRIM_TZ', parse: raw => (isValidTimeZone(raw.trim()) ? raw.trim() : null) },
  vaultIdleMinutes: { key: 'app.vaultIdleMinutes', env: 'TAZRIM_VAULT_IDLE_MINUTES', parse: integerIn(VAULT_IDLE_RANGE) },
  syncConcurrency: { key: 'app.syncConcurrency', env: 'TAZRIM_SYNC_CONCURRENCY', parse: integerIn(SYNC_CONCURRENCY_RANGE) },
  origins: { key: 'app.origins', env: 'TAZRIM_ORIGINS', parse: parseOrigins },
  requireHttps: { key: 'app.requireHttps', env: 'TAZRIM_REQUIRE_HTTPS', parse: raw => (/^(0|1)$/.test(raw) ? raw : null) },
}

const NAMES = Object.keys(DEFS) as SettingName[]
const STALE_MS = 30_000

interface Cache {
  values: Partial<Record<SettingName, string>>
  loadedAt: number
  loading: Promise<void> | null
}
// One cache per server process (and across dev hot reloads / separately bundled routes)
const g = globalThis as unknown as { __tazrimAppSettings?: Cache }
const cache = (g.__tazrimAppSettings ??= { values: {}, loadedAt: 0, loading: null })

/** Reads the stored values into memory. Never throws: a failing read keeps what is there. */
export function loadAppSettings(): Promise<void> {
  cache.loading ??= prisma.setting
    .findMany({ where: { key: { in: NAMES.map(n => DEFS[n].key) } } })
    .then(rows => {
      const values: Cache['values'] = {}
      for (const n of NAMES) {
        const v = rows.find(r => r.key === DEFS[n].key)?.value
        if (v !== undefined) values[n] = v
      }
      cache.values = values
      cache.loadedAt = Date.now()
    })
    .catch(() => {})
    .finally(() => {
      cache.loading = null
    })
  return cache.loading
}

/** Forget what is in memory (tests; a write does this and reloads) */
export function resetAppSettingsCache() {
  cache.values = {}
  cache.loadedAt = 0
  cache.loading = null
}

function envValue(name: SettingName): string | null {
  const raw = process.env[DEFS[name].env]
  if (raw === undefined || raw.trim() === '') return null
  return raw.trim()
}

export type Source = 'env' | 'db' | 'default'

/** The effective text of a value, and where it came from. Env wins; an invalid value is skipped for the next source. */
function resolve(name: SettingName, fallback: string): { value: string; source: Source } {
  if (Date.now() - cache.loadedAt > STALE_MS) void loadAppSettings()
  const def = DEFS[name]
  const env = envValue(name)
  if (env !== null) {
    if (name === 'requireHttps') return { value: TRUE.test(env) ? '1' : '0', source: 'env' }
    const parsed = def.parse(env)
    if (parsed !== null) return { value: parsed, source: 'env' }
  }
  const stored = cache.values[name]
  if (stored !== undefined) {
    const parsed = def.parse(stored)
    if (parsed !== null && !(name !== 'origins' && parsed === '')) return { value: parsed, source: 'db' }
  }
  return { value: fallback, source: 'default' }
}

export const getTimeZone = () => resolve('timeZone', DEFAULT_TIME_ZONE).value
export const getVaultIdleMinutes = () => Number(resolve('vaultIdleMinutes', String(DEFAULT_VAULT_IDLE_MINUTES)).value)
export const getSyncConcurrency = () => Number(resolve('syncConcurrency', String(DEFAULT_SYNC_CONCURRENCY)).value)
/** Allowed sign-in origins, lower-cased without a trailing slash; empty = any */
export const getOrigins = (): string[] => resolve('origins', '').value.split(',').filter(Boolean)
export const getRequireHttps = () => resolve('requireHttps', '0').value === '1'

/** Make the effective time zone the process's own: dates and months follow it from now on */
export function applyTimeZone(): string {
  const tz = getTimeZone()
  if (process.env.TZ !== tz) process.env.TZ = tz
  return tz
}

export interface SettingView<T> {
  value: T
  /** Set in `.env`: the control is read-only */
  locked: boolean
}
export interface AppSettingsView {
  timeZone: SettingView<string>
  vaultIdleMinutes: SettingView<number>
  syncConcurrency: SettingView<number>
  origins: SettingView<string>
  requireHttps: SettingView<boolean>
}

/** Everything for the Settings pages (reads fresh from the database first) */
export async function getAppSettingsView(): Promise<AppSettingsView> {
  await loadAppSettings()
  const locked = (n: SettingName) => resolve(n, '').source === 'env'
  return {
    timeZone: { value: getTimeZone(), locked: locked('timeZone') },
    vaultIdleMinutes: { value: getVaultIdleMinutes(), locked: locked('vaultIdleMinutes') },
    syncConcurrency: { value: getSyncConcurrency(), locked: locked('syncConcurrency') },
    origins: { value: getOrigins().join(', '), locked: locked('origins') },
    requireHttps: { value: getRequireHttps(), locked: locked('requireHttps') },
  }
}

export class SettingError extends Error {
  constructor(message: string, readonly code: 'INVALID' | 'LOCKED' | 'UNKNOWN') {
    super(message)
  }
}

const INVALID: Record<SettingName, string> = {
  timeZone: 'אזור זמן לא מוכר',
  vaultIdleMinutes: `דקות חייבות להיות מספר שלם בין ${VAULT_IDLE_RANGE.min} ל-${VAULT_IDLE_RANGE.max}`,
  syncConcurrency: `מספר הבנקים חייב להיות בין ${SYNC_CONCURRENCY_RANGE.min} ל-${SYNC_CONCURRENCY_RANGE.max}`,
  origins: 'כתובות מופרדות בפסיקים, כל אחת בצורה http://כתובת או https://כתובת, בלי נתיב',
  requireHttps: 'ערך לא תקין',
}

/**
 * Saves one value (null removes it: back to the default). Refused while `.env` sets it.
 * Applies at once: memory is reloaded, and the time zone is assigned to the process.
 */
export async function setAppSetting(name: SettingName, input: string | number | boolean | null): Promise<void> {
  const def = DEFS[name]
  if (!def) throw new SettingError('הגדרה לא מוכרת', 'UNKNOWN')
  if (envValue(name) !== null) throw new SettingError('ההגדרה הזאת נקבעת בקובץ .env', 'LOCKED')
  if (input === null || (name === 'origins' && String(input).trim() === '')) {
    await prisma.setting.deleteMany({ where: { key: def.key } })
  } else {
    const raw = typeof input === 'boolean' ? (input ? '1' : '0') : String(input)
    const value = def.parse(raw)
    if (value === null) throw new SettingError(INVALID[name], 'INVALID')
    await prisma.setting.upsert({ where: { key: def.key }, create: { key: def.key, value }, update: { value } })
  }
  cache.loading = null
  await loadAppSettings()
  if (name === 'timeZone') applyTimeZone()
}
