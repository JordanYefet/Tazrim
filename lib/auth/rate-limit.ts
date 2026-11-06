/**
 * A fixed-window counter per key, in memory: enough for one self-hosted
 * process. Login, recovery, setup and invite routes use it, keyed by the
 * client address, so guessing a code or link is slow.
 */
const store = (globalThis as unknown as { __tazrimRate?: Map<string, { count: number; resetAt: number }> })
const buckets = (store.__tazrimRate ??= new Map())

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    if (buckets.size > 5000) sweep(now)
    return true
  }
  b.count++
  return b.count <= limit
}

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}

/** The client address as the proxy reports it (Caddy sets X-Forwarded-For), else one shared key */
export function clientKey(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || headers.get('x-real-ip') || 'direct'
}

export function resetRateLimits() {
  buckets.clear()
}
