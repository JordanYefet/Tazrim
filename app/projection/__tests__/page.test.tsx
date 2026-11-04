import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ProjectionPage } from '@/lib/db/projection'

const banks = [{ id: 'b1', displayName: 'בנק לדוגמה' }]
const month = (month: string, expected: number, tight = false) => ({
  month, income: 10000, expense: 6000, net: 4000, expected, low: expected - 500, high: expected + 500, stale: false, tight,
})
let page: ProjectionPage
vi.mock('@/lib/db/projection', () => ({ getProjection: async () => page }))
vi.mock('next/navigation', () => ({ usePathname: () => '/projection', useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))

async function render() {
  const { default: ProjectionPage } = await import('../page')
  return renderToStaticMarkup(await ProjectionPage({ searchParams: Promise.resolve({}) }))
}

describe('/projection', () => {
  it('shows the headline, the table and what went in', async () => {
    const months = Array.from({ length: 12 }, (_, i) => month(`2031-${String(i + 1).padStart(2, '0')}`, 9000 + i * 4000))
    page = {
      insufficient: false, banks, accountId: null, cushion: 0, sigma: 500,
      start: { balance: 5000, date: '2030-12-03' }, months, end: months[11], tight: [], past: [],
      seasonal: false,
      categories: [{ name: 'מזון', monthlyAmount: 2500 }],
      items: [
        { key: 'income:משכורת', name: 'משכורת', kind: 'everyday', direction: 'in', cadence: null, monthlyAmount: 10000, seriesKey: null },
        { key: 'rec:שכירות', name: 'שכירות', kind: 'recurring', direction: 'out', cadence: 'monthly', monthlyAmount: 3000, seriesKey: 's1' },
      ],
    }
    const html = await render()
    expect(html).toContain('בעוד 12 חודשים')
    expect(html).toContain('<h1')
    expect(html).toContain('תחזית')
    expect(html).toContain('href="/recurring"')
    // one hero card beside the donut, the chart below, the cushion shortcut
    expect(html.match(/surface-hero/g)!.length).toBe(1)
    expect(html).toContain('lg:grid-cols-2')
    expect(html).not.toMatch(/grid [^"]*items-start/)
    expect(html).toContain('href="/settings#projection"')
    expect(html).toContain('הוצאות צפויות בחודש רגיל')
    expect(html).toContain('מזון')
  })

  it('reserves the tight line, and fills it when a month is tight', async () => {
    const months = Array.from({ length: 12 }, (_, i) => month(`2031-${String(i + 1).padStart(2, '0')}`, 1000, i === 2))
    page = { ...page, months, end: months[11], tight: [months[2]], cushion: 2000 } as ProjectionPage
    const html = await render()
    expect(html).toContain('data-tight-line')
    expect(html).toContain('דחוק')
  })

  it('asks for more months when there is not enough history', async () => {
    page = { insufficient: true, completeMonths: 2, banks, accountId: null }
    const html = await render()
    expect(html).toContain('3 חודשים')
    expect(html).toContain('href="/upload"')
  })

  it('shows the picker only with more than one bank', async () => {
    page = { insufficient: true, completeMonths: 0, banks, accountId: null }
    expect(await render()).not.toContain('data-bank-picker')
    page = { insufficient: true, completeMonths: 0, banks: [...banks, { id: 'b2', displayName: 'עוד בנק' }], accountId: null }
    expect(await render()).toContain('data-bank-picker')
  })
})
