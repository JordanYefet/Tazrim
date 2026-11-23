/**
 * "What is the newest Tazrim release?" for the app (ENG-131). The app asks the helper instead of
 * GitHub itself when the install runs behind the egress proxy (the app container has no way out
 * but Squid, which lets it reach banks only): the helper's network may reach api.github.com and
 * nothing else. The helper does not interpret the answer; GitHub's JSON goes back as it is and
 * the app parses it like a direct answer (lib/updates/version.ts).
 *
 * The helper's `fetch` goes through HTTPS_PROXY when compose sets NODE_USE_ENV_PROXY=1 (Node 22).
 */
export const GITHUB_API = 'https://api.github.com/repos/JordanYefet/Tazrim'
export const LATEST_URL = `${GITHUB_API}/releases/latest`
export const TIMEOUT_MS = 5000

/**
 * One GET with the helper's User-Agent and a hard time limit (the race also covers a fetch that
 * ignores the abort signal). Resolves the Response, or 'timeout'; rejects when the fetch does.
 * `done()` clears the timer once the body has been read.
 */
export async function getWithTimeout(url, { fetchImpl = fetch, helperVersion = '0.0.0', timeoutMs = TIMEOUT_MS, accept = 'application/vnd.github+json' } = {}) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort()
      resolve('timeout')
    }, timeoutMs)
  })
  const request = fetchImpl(url, {
    headers: { 'User-Agent': `Tazrim-updater/${helperVersion}`, Accept: accept },
    signal: controller.signal,
  })
  request.catch(() => {})
  try {
    return { res: await Promise.race([request, timeout]), timeout, done: () => clearTimeout(timer) }
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

/**
 * { release: <GitHub JSON> } or { error: 'NETWORK' | 'RATE_LIMIT' | 'BAD_RESPONSE' }: the same
 * three failures, with the same meaning, as the app's own check (lib/updates/check.ts).
 * Never throws.
 */
export async function fetchLatest({ fetchImpl = fetch, helperVersion = '0.0.0', timeoutMs = TIMEOUT_MS } = {}) {
  let got
  try {
    got = await getWithTimeout(LATEST_URL, { fetchImpl, helperVersion, timeoutMs })
    const res = got.res
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
    got?.done()
  }
}
