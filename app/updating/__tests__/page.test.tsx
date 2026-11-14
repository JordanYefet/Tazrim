import { afterEach, describe, expect, it, vi } from 'vitest'

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`)
})
const getUpdateView = vi.fn()
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))
vi.mock('@/lib/updates/state', () => ({ getUpdateView: () => getUpdateView() }))
vi.mock('@/components/updates/updating-screen', () => ({ UpdatingScreen: () => null }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('/updating', () => {
  it('the read-only demo has no updates: back to Settings → Updates without reading any state', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '1')
    const { default: UpdatingPage } = await import('../page')
    await expect(UpdatingPage({ searchParams: Promise.resolve({ start: '9.2.0' }) })).rejects.toThrow('REDIRECT /settings/updates')
    expect(getUpdateView).not.toHaveBeenCalled()
  })

  it('otherwise follows a just-started job', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '0')
    getUpdateView.mockResolvedValue({ job: null })
    const { default: UpdatingPage } = await import('../page')
    await expect(UpdatingPage({ searchParams: Promise.resolve({ start: '9.2.0' }) })).resolves.toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })
})
