import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchResultList } from '../search-result-list'
import type { SearchResult } from '@/lib/search/query'

// Made-up rows only.
const rows: SearchResult[] = [
  {
    id: 'c1',
    source: 'card',
    accountId: 'acct_test',
    accountName: 'Test Card',
    date: '2030-04-07',
    dateMs: 0,
    description: 'Fake Cafe',
    originalDescription: 'FAKE*CAFE*RAW',
    amount: 42,
    category: 'Food',
    note: 'with a fake friend',
    ignored: false,
  },
  {
    id: 'b1',
    source: 'bank',
    accountId: 'acct_bank',
    accountName: 'Test Bank',
    date: '2030-04-01',
    dateMs: 0,
    description: 'Fake Payroll',
    amount: -1000,
    ignored: true,
  },
]

describe('SearchResultList', () => {
  const html = renderToStaticMarkup(<SearchResultList results={rows} terms={['fake']} />)

  it('links every row through transactionHref', () => {
    expect(html).toContain('href="/cards/max?year=2030&amp;month=4&amp;search=Fake+Cafe"')
    expect(html).toContain('href="/bank?year=2030&amp;month=4&amp;search=Fake+Payroll&amp;showIgnored=true"')
  })

  it('highlights the matched text in the name, the original and the note', () => {
    expect(html.match(/<mark[^>]*>/g)?.length).toBe(4)
    expect(html).toContain('>FAKE</mark>')
  })

  it('shows date, account, category chip, ignored tag and signed amount', () => {
    expect(html).toContain('07.04.2030')
    expect(html).toContain('Test Card')
    expect(html).toContain('>Food</span>')
    expect(html).toContain('מוסתרת')
    expect(html).toMatch(/income[^>]*>\+[^<]*1,000/)
  })
})
