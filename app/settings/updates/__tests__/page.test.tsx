import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import pkg from '@/package.json'

// Made-up versions only.
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`)
})
const getUpdateView = vi.fn()
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))
vi.mock('@/lib/updates/state', () => ({ getUpdateView: () => getUpdateView() }))
vi.mock('@/components/updates/version-card', () => ({
  VersionCard: ({ initial }: { initial: { current: string } }) => <p>version card {initial.current}</p>,
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('Settings → Updates', () => {
  it('the read-only demo has no updates: back to Settings without reading any state', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '1')
    const { default: UpdatesPage } = await import('../page')
    await expect(UpdatesPage()).rejects.toThrow('REDIRECT /settings')
    expect(getUpdateView).not.toHaveBeenCalled()
  })

  it('shows the version card under the Settings back link', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '0')
    getUpdateView.mockResolvedValue({ current: '9.1.0' })
    const { default: UpdatesPage } = await import('../page')
    const html = renderToStaticMarkup(await UpdatesPage())
    expect(html).toContain('>עדכונים</h1>')
    expect(html).toContain('href="/settings"')
    expect(html).toContain('version card 9.1.0')
  })

  it('a failing read leaves the plain version line', async () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '0')
    getUpdateView.mockRejectedValue(new Error('boom'))
    const { default: UpdatesPage } = await import('../page')
    const html = renderToStaticMarkup(await UpdatesPage())
    expect(html).not.toContain('version card')
    expect(html).toContain(pkg.version)
  })
})
