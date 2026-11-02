import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ProjectedMonth } from '@/lib/insights/projection'

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))

// Made-up values only
const month = (m: string, stale: boolean): ProjectedMonth => ({
  month: m, income: 5000, expense: 3000, net: 2000, expected: 7000, low: 6500, high: 7500, stale, tight: false,
})

describe('stale months are faint everywhere', () => {
  it('table: a stale row is dimmed as a whole, with no income colour or full-strength balance', async () => {
    const { ProjectionTable } = await import('../projection-table')
    const html = renderToStaticMarkup(<ProjectionTable months={[month('2030-07', true), month('2030-08', false)]} />)
    const [stale, fresh] = html.split('<tr').slice(2)
    expect(stale).toContain('text-muted-foreground')
    expect(stale).not.toContain('--income')
    expect(stale).not.toContain('text-foreground')
    expect(fresh).toContain('--income')
    expect(fresh).toContain('text-foreground')
  })

  it('chart tooltip: a stale month shows its value and range', async () => {
    const { ChartTooltip } = await import('../projection-chart')
    const row = { label: 'יולי 30', staleExpected: 7000, staleBand: [6500, 7500] }
    const html = renderToStaticMarkup(<ChartTooltip active payload={[{ payload: row }]} label={row.label} />)
    expect(html).toMatch(/7,000/)
    expect(html).toMatch(/6,500/)
    expect(html).toMatch(/7,500/)
  })
})
