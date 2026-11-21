/**
 * "What is the newest Tazrim release?" for the app (ENG-131). The app asks the helper instead of
 * GitHub itself when the install runs behind the egress proxy (the app container has no way out
 * but Squid, which lets it reach banks only): the helper's network may reach api.github.com and
 * nothing else. The helper does not interpret the answer; GitHub's JSON goes back as it is and
 * the app parses it like a direct answer (lib/updates/version.ts).
 *
 * The helper's `fetch` goes through HTTPS_PROXY when compose sets NODE_USE_ENV_PROXY=1 (Node 22).
 */
export const LATEST_URL = 'https://api.github.com/repos/JordanYefet/Tazrim/releases/latest'
const TIMEOUT_MS = 5000

/**
 * { release: <GitHub JSON> } or { error: 'NETWORK' | 'RATE_LIMIT' | 'BAD_RESPONSE' }: the same
 * three failures, with the same meaning, as the app's own check (lib/updates/check.ts).
 * Never throws.
 */
export async function fetchLatest({ fetchImpl = fetch, helperVersion = '0.0.0', timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  let timer
  // The race also covers a fetch that ignores the abort signal
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort()
      resolve('timeout')
    }, timeoutMs)
  })
  try {
    const res = await Promise.race([
      fetchImpl(LATEST_URL, {
        headers: { 'User-Agent': `Tazrim-updater/${helperVersion}`, Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      }),
      timeout,
    ])
    if (res === 'timeout') return { error: 'NETWORK' }
    if (res.status === 403 || res.status === 429) return { error: 'RATE_LIMIT' }
    if (!res.ok) return { error: 'BAD_RESPONSE' }
    try {
      return { release: await res.json() }
    } catch {
      return { error: 'BAD_RESPONSE' }
    }
  } catch {
    return { error: 'NETWORK' }
  } finally {
    clearTimeout(timer)
  }
}
