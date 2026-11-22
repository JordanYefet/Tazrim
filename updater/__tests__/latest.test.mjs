import { describe, expect, it } from 'vitest'
import { fetchLatest, LATEST_URL } from '../latest.mjs'

const ok = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('fetchLatest', () => {
  it('asks GitHub for the latest release and returns its JSON untouched', async () => {
    const calls = []
    const r = await fetchLatest({
      helperVersion: '9.9.9',
      fetchImpl: (url, init) => (calls.push([url, init]), ok({ tag_name: 'v9.1.0' })),
    })
    expect(r).toEqual({ release: { tag_name: 'v9.1.0' } })
    expect(calls[0][0]).toBe(LATEST_URL)
    expect(LATEST_URL).toBe('https://api.github.com/repos/JordanYefet/Tazrim/releases/latest')
    expect(calls[0][1].headers).toEqual({ 'User-Agent': 'Tazrim-updater/9.9.9', Accept: 'application/vnd.github+json' })
  })

  it('says RATE_LIMIT on 403 and 429, BAD_RESPONSE on other errors or bad JSON', async () => {
    expect(await fetchLatest({ fetchImpl: () => ok({}, 403) })).toEqual({ error: 'RATE_LIMIT' })
    expect(await fetchLatest({ fetchImpl: () => ok({}, 429) })).toEqual({ error: 'RATE_LIMIT' })
    expect(await fetchLatest({ fetchImpl: () => ok({}, 500) })).toEqual({ error: 'BAD_RESPONSE' })
    expect(await fetchLatest({ fetchImpl: () => Promise.resolve(new Response('<html>', { status: 200 })) })).toEqual({ error: 'BAD_RESPONSE' })
  })

  it('says NETWORK when the request fails or hangs (a proxy that refuses ends up here)', async () => {
    expect(await fetchLatest({ fetchImpl: () => Promise.reject(new Error('refused')) })).toEqual({ error: 'NETWORK' })
    expect(await fetchLatest({ timeoutMs: 20, fetchImpl: () => new Promise(() => {}) })).toEqual({ error: 'NETWORK' })
  })
})
