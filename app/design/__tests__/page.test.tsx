import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TOKEN_GROUPS } from '@/lib/design/tokens'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  usePathname: () => '/design',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}))
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'system', setTheme: () => {}, resolvedTheme: 'light' }) }))

afterEach(() => vi.unstubAllEnvs())

async function render() {
  const { default: DesignPage } = await import('../page')
  return renderToStaticMarkup(<DesignPage />)
}

describe('/design', () => {
  it('is not found in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('shows every token group and token in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const html = await render()
    for (const g of TOKEN_GROUPS) {
      expect(html).toContain(g.title)
      for (const t of g.tokens) expect(html).toContain(t.name)
    }
  })

  it('shows a live instance of every shared component', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const html = await render()
    for (const name of [
      'RollingNumber', 'SegmentedTrack', 'DimmablePair', 'Reveal', 'AppDialog', 'PaymentCard', 'BankElement',
      'AccountMini', 'ConfirmDialog', 'DataSwap', 'MonthBarsChart', 'EmptyMonthSlots', 'BalanceChart',
    ]) expect(html).toContain(`>${name}</h3>`)
  })

  it('paints swatches from the tokens, never from fixed colours', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const html = await render()
    expect(html).toContain('background:hsl(var(--background))')
    expect(html).toContain('background:var(--chart-1)')
    expect(html).toContain('box-shadow:var(--elevation-2)')
    const swatchStyles = [...html.matchAll(/data-token="[^"]+"[^>]*style="([^"]*)"/g)].map(m => m[1])
    expect(swatchStyles.length).toBeGreaterThan(30)
    expect(swatchStyles.filter(s => /#[0-9a-f]{3,6}/i.test(s))).toEqual([])
  })

  it('is right to left and names the tab', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const html = await render()
    expect(html).toContain('dir="rtl"')
    const { metadata } = await import('../page')
    expect(metadata.title).toBe('מערכת עיצוב · תזרים')
  })
})
