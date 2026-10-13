import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RecurringList } from '../recurring-list'
import type { RecurringSeries } from '@/lib/insights/recurring'

const base: RecurringSeries = {
  key: 'card||streamly|monthly',
  baseKey: 'card||streamly',
  name: 'Streamly',
  merchant: 'streamly',
  source: 'card',
  category: null,
  cadence: 'monthly',
  amount: 40,
  latestAmount: 40,
  monthlyAmount: 40,
  occurrences: 4,
  firstDate: '2026-01-05',
  lastDate: '2026-04-05',
  nextDate: '2026-05-05',
  active: true,
  isNew: false,
  priceIncrease: null,
  isCardPayment: false,
  transactionIds: ['a', 'b', 'c', 'd'],
}

describe('RecurringList', () => {
  it('renders each series with its badges and the action slot', () => {
    const html = renderToStaticMarkup(
      <RecurringList
        total={90}
        series={[
          { ...base, isNew: true },
          { ...base, key: 'k2', name: 'GymCo', latestAmount: 50, priceIncrease: { from: 40, to: 50, since: '2026-04-05' } },
        ]}
        actions={s => <button>dismiss {s.key}</button>}
      />
    )
    expect(html).toContain('Streamly')
    expect(html).toContain('GymCo')
    expect(html).toContain('חדש')
    expect(html).toContain('התייקר')
    expect(html).toContain('dismiss k2')
  })

  it('shows an empty state', () => {
    expect(renderToStaticMarkup(<RecurringList total={0} series={[]} />)).toContain('עדיין לא זוהו')
  })
})
