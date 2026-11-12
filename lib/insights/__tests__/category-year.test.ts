import { describe, expect, it } from 'vitest'
import { merchantYear, summarizeCategoryYear, sumByMonth, topMerchants, type CategoryYearRow } from '../category-year'

// Made-up rows only
const row = (over: Partial<CategoryYearRow>): CategoryYearRow => ({
  id: over.id ?? `${over.source ?? 'card'}-${over.month}-${over.description}-${over.amount}`,
  source: 'card',
  accountId: 'acct_test',
  accountName: 'Test card',
  date: `2030-${String(over.month ?? 1).padStart(2, '0')}-10`,
  dateMs: new Date(2030, (over.month ?? 1) - 1, 10).getTime(),
  description: 'FAKE SHOP',
  amount: 100,
  category: 'Test food',
  ignored: false,
  month: 1,
  ...over,
})

const rows: CategoryYearRow[] = [
  row({ month: 1, description: 'FAKE SHOP', amount: 100 }),
  row({ month: 1, description: 'FAKE MARKET', amount: 40 }),
  row({ month: 2, description: 'FAKE SHOP', amount: 200 }),
  // A refund reduces the month and the merchant
  row({ month: 2, description: 'FAKE SHOP', amount: -50 }),
  // A bank debit of the same category counts with the cards
  row({ month: 3, source: 'bank', accountName: 'Test bank', description: 'FAKE MARKET', amount: 60 }),
]

// The clock stands in April 2030, so March is the latest finished month
const now = new Date(2030, 3, 15)

describe('sumByMonth', () => {
  it('has every month, refunds subtract, income rows count the money in', () => {
    const months = sumByMonth(rows, 'EXPENSE')
    expect(Object.keys(months)).toHaveLength(12)
    expect(months[1]).toBe(140)
    expect(months[2]).toBe(150)
    expect(months[3]).toBe(60)
    expect(months[4]).toBe(0)

    const income = sumByMonth([row({ month: 5, source: 'bank', amount: -1000 })], 'INCOME')
    expect(income[5]).toBe(1000)
  })
})

describe('topMerchants', () => {
  it('groups by the shown name, largest total first, with a sample row for the window', () => {
    const merchants = topMerchants(rows, 'EXPENSE')
    expect(merchants.map(m => [m.name, m.count, m.total])).toEqual([
      ['FAKE SHOP', 3, 250],
      ['FAKE MARKET', 2, 100],
    ])
    expect(merchants[0].sample).toEqual({ source: 'card', id: rows[0].id })
  })

  it('keeps at most the limit', () => {
    const many = Array.from({ length: 8 }, (_, i) => row({ month: 1, description: `FAKE ${i}`, amount: 10 + i }))
    expect(topMerchants(many, 'EXPENSE', 5)).toHaveLength(5)
    expect(topMerchants(many, 'EXPENSE', 5)[0].name).toBe('FAKE 7')
  })
})

describe('summarizeCategoryYear', () => {
  it('totals the year, averages the finished months with data, and shares the year total', () => {
    const s = summarizeCategoryYear(rows, { kind: 'EXPENSE', year: 2030, yearTotal: 1400, lastDataMonth: 4, now })
    expect(s.total).toBe(350)
    // January to March are finished; April is in progress and left out
    expect(s.averageMonths).toBe(3)
    expect(s.average).toBeCloseTo(350 / 3)
    expect(s.share).toBeCloseTo(0.25)
  })

  it('lists the selected month, newest first, and says when it is in progress', () => {
    const s = summarizeCategoryYear(rows, { kind: 'EXPENSE', year: 2030, month: 2, yearTotal: 1400, lastDataMonth: 4, now })
    expect(s.focusMonth).toBe(2)
    expect(s.focusInProgress).toBe(false)
    expect(s.monthRows.map(r => r.amount)).toEqual([200, -50])

    const april = summarizeCategoryYear(rows, { kind: 'EXPENSE', year: 2030, month: 4, yearTotal: 1400, lastDataMonth: 4, now })
    expect(april.focusInProgress).toBe(true)
    expect(april.monthRows).toEqual([])
  })

  it('without a selected month lists the latest month the category has rows in', () => {
    const s = summarizeCategoryYear(rows, { kind: 'EXPENSE', year: 2030, yearTotal: 1400, lastDataMonth: 4, now })
    expect(s.focusMonth).toBe(3)
    expect(s.monthRows.map(r => r.source)).toEqual(['bank'])
  })

  it('an empty year: nothing to average, share or list', () => {
    const s = summarizeCategoryYear([], { kind: 'EXPENSE', year: 2030, yearTotal: 0, lastDataMonth: null, now })
    expect(s.total).toBe(0)
    expect(s.average).toBeNull()
    expect(s.share).toBeNull()
    expect(s.focusMonth).toBeUndefined()
    expect(s.merchants).toEqual([])
    expect(s.monthRows).toEqual([])
  })

  it('before any month has finished there is no average', () => {
    const january = [row({ month: 1, amount: 100 })]
    const s = summarizeCategoryYear(january, { kind: 'EXPENSE', year: 2030, yearTotal: 100, lastDataMonth: 1, now: new Date(2030, 0, 20) })
    expect(s.average).toBeNull()
    expect(s.averageMonths).toBe(0)
    expect(s.total).toBe(100)
  })
})

describe('merchantYear', () => {
  it('sums the merchant by month with its count', () => {
    const m = merchantYear('FAKE SHOP', 2030, rows.filter(r => r.description === 'FAKE SHOP'), 'EXPENSE')
    expect(m).toMatchObject({ name: 'FAKE SHOP', year: 2030, total: 250, count: 3 })
    expect(m.months[1]).toBe(100)
    expect(m.months[2]).toBe(150)
  })
})
