/**
 * The daily "is there a newer Tazrim?" check (ENG-98): one unauthenticated GET to
 * GitHub's latest-release endpoint, the answer cached in Setting 'updates.cache'.
 * Never throws: a failed check keeps the last known release and records why.
 */
import pkg from '@/package.json'
import { prisma } from '@/lib/db/client'
import { parseRelease, type ReleaseInfo } from './version'
import { CACHE_KEY, getAutoCheck } from './settings'

export const CURRENT_VERSION: string = pkg.version

export interface UpdateCache {
  latest: ReleaseInfo | null
  checkedAt: string | null
  error: 'NETWORK' | 'RATE_LIMIT' | 'BAD_RESPONSE' | null
}

const LATEST_URL = 'https://api.github.com/repos/JordanYefet/Tazrim/releases/latest'
const TIMEOUT_MS = 5000
const FIRST_RUN_DELAY_MS = 30_000
const DAY_MS = 24 * 60 * 60 * 1000

const EMPTY: UpdateCache = { latest: null, checkedAt: null, error: null }

export async function getUpdateCache(): Promise<UpdateCache> {
  const row = await prisma.setting.findUnique({ where: { key: CACHE_KEY } })
  if (!row) return { ...EMPTY }
  try {
    const v = JSON.parse(row.value) as Partial<UpdateCache>
    return { latest: v.latest ?? null, checkedAt: v.checkedAt ?? null, error: v.error ?? null }
  } catch {
    return { ...EMPTY }
  }
}

async function saveCache(cache: UpdateCache): Promise<void> {
  const value = JSON.stringify(cache)
  await prisma.setting.upsert({ where: { key: CACHE_KEY }, create: { key: CACHE_KEY, value }, update: { value } })
}

type Outcome = { release: ReleaseInfo } | { error: NonNullable<UpdateCache['error']> }

async function fetchLatest(fetchImpl: typeof fetch): Promise<Outcome> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  // The race also covers a fetch that ignores the abort signal.
  const timeout = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => {
      controller.abort()
      resolve('timeout')
    }, TIMEOUT_MS)
  })
  try {
    const res = await Promise.race([
      fetchImpl(LATEST_URL, {
        headers: { 'User-Agent': `Tazrim/${CURRENT_VERSION}`, Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      }),
      timeout,
    ])
    if (res === 'timeout') return { error: 'NETWORK' }
    if (res.status === 403 || res.status === 429) return { error: 'RATE_LIMIT' }
    if (!res.ok) return { error: 'BAD_RESPONSE' }
    let json: unknown
    try {
      json = await res.json()
    } catch {
      return { error: 'BAD_RESPONSE' }
    }
    const release = parseRelease(json)
    return release ? { release } : { error: 'BAD_RESPONSE' }
  } catch {
    return { error: 'NETWORK' }
  } finally {
    clearTimeout(timer)
  }
}

/** Asks GitHub now and caches the answer. On failure keeps the previous `latest` and sets `error`. */
export async function checkNow(fetchImpl: typeof fetch = fetch): Promise<UpdateCache> {
  const previous = await getUpdateCache().catch(() => ({ ...EMPTY }))
  const outcome = await fetchLatest(fetchImpl)
  const checkedAt = new Date().toISOString()
  const next: UpdateCache =
    'release' in outcome
      ? { latest: outcome.release, checkedAt, error: null }
      : { latest: previous.latest, checkedAt, error: outcome.error }
  try {
    await saveCache(next)
  } catch (e) {
    console.warn('updates: could not save the check result', e)
  }
  return next
}

const STARTED = Symbol.for('tazrim.updates.daily-check')

/**
 * Starts the once-a-day check for this process (a second call does nothing): the first
 * run 30 s after start when the cache is older than 24 h, then every 24 h. Each tick
 * re-reads the setting, so turning it off takes effect without a restart.
 */
export function startDailyCheck(): void {
  const g = globalThis as Record<symbol, unknown>
  if (g[STARTED]) return
  g[STARTED] = true

  const tick = async (onlyIfStale: boolean) => {
    try {
      if (!(await getAutoCheck())) return
      if (onlyIfStale) {
        const { checkedAt } = await getUpdateCache()
        if (checkedAt && Date.now() - new Date(checkedAt).getTime() < DAY_MS) return
      }
      await checkNow()
    } catch (e) {
      console.warn('updates: scheduled check failed', e)
    }
  }

  setTimeout(() => void tick(true), FIRST_RUN_DELAY_MS).unref()
  setInterval(() => void tick(false), DAY_MS).unref()
}
