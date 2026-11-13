import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

let db: TestDb

const RELEASE = {
  tag_name: 'v9.1.0',
  draft: false,
  prerelease: false,
  html_url: 'https://github.com/JordanYefet/Tazrim/releases/tag/v9.1.0',
  published_at: '2026-11-13T11:20:28Z',
  body: '* feat: Fake thing',
}

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

beforeAll(() => {
  db = createTestDb()
  usePrismaOn(db)
})
beforeEach(() => {
  db.exec(`DELETE FROM "Setting";`)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('checkNow', () => {
  it('stores and returns the latest release, asking GitHub politely', async () => {
    const { checkNow, getUpdateCache, CURRENT_VERSION } = await import('../check')
    const fetchMock = vi.fn(() => ok(RELEASE))
    const res = await checkNow(fetchMock as unknown as typeof fetch)
    expect(res.error).toBeNull()
    expect(res.latest?.version).toBe('9.1.0')
    expect(res.latest?.notes).toEqual(['Fake thing'])
    expect(res.checkedAt).toBeTruthy()
    expect(await getUpdateCache()).toEqual(res)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/JordanYefet/Tazrim/releases/latest')
    expect(init.headers).toEqual({ 'User-Agent': `Tazrim/${CURRENT_VERSION}`, Accept: 'application/vnd.github+json' })
  })

  it('reports NETWORK when fetch rejects and keeps the previous release', async () => {
    const { checkNow } = await import('../check')
    await checkNow((() => ok(RELEASE)) as unknown as typeof fetch)
    const res = await checkNow((() => Promise.reject(new Error('offline'))) as unknown as typeof fetch)
    expect(res.error).toBe('NETWORK')
    expect(res.latest?.version).toBe('9.1.0')
  })

  it('reports RATE_LIMIT on 403', async () => {
    const { checkNow } = await import('../check')
    const res = await checkNow((() => ok({ message: 'rate limit' }, 403)) as unknown as typeof fetch)
    expect(res.error).toBe('RATE_LIMIT')
    expect(res.latest).toBeNull()
  })

  it('reports BAD_RESPONSE for garbage', async () => {
    const { checkNow } = await import('../check')
    const garbage = () => Promise.resolve(new Response('<html>nope</html>', { status: 200 }))
    expect((await checkNow(garbage as unknown as typeof fetch)).error).toBe('BAD_RESPONSE')
    expect((await checkNow((() => ok({ tag_name: 'latest' })) as unknown as typeof fetch)).error).toBe('BAD_RESPONSE')
  })

  it('gives up on a fetch that never answers after 5 seconds', async () => {
    const { checkNow } = await import('../check')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let called!: () => void
    const wasCalled = new Promise<void>(r => (called = r))
    const hang = () => {
      called()
      return new Promise<Response>(() => {})
    }
    const pending = checkNow(hang as unknown as typeof fetch)
    await wasCalled
    await vi.advanceTimersByTimeAsync(5000)
    expect((await pending).error).toBe('NETWORK')
  })
})

describe('auto check setting', () => {
  it('is on when unset and off after setAutoCheck(false)', async () => {
    const { getAutoCheck, setAutoCheck } = await import('../settings')
    expect(await getAutoCheck()).toBe(true)
    await setAutoCheck(false)
    expect(await getAutoCheck()).toBe(false)
    await setAutoCheck(true)
    expect(await getAutoCheck()).toBe(true)
  })
})
