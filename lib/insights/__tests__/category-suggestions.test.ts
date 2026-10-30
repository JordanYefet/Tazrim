import { describe, expect, it } from 'vitest'
import {
  SUGGESTION_TOLERANCE,
  suggestCategories,
  suggestCategory,
  type SuggestionRow,
} from '@/lib/insights/category-suggestions'

// Made-up rows only
let n = 0
const row = (over: Partial<SuggestionRow> = {}): SuggestionRow => ({
  id: `r${++n}`,
  date: new Date(2030, 1, 1),
  originalDescription: 'FAKE CHEQUE',
  description: 'FAKE CHEQUE',
  debit: 100,
  credit: 0,
  category: null,
  ignored: false,
  ...over,
})

describe('suggestCategory', () => {
  it('suggests the category of a row with the same description and amount', () => {
    const from = row({ category: 'Fake Insurance', date: new Date(2030, 0, 5) })
    expect(suggestCategory(row(), [from])).toEqual({
      category: 'Fake Insurance',
      fromAmount: 100,
      fromDate: new Date(2030, 0, 5),
    })
  })

  it('accepts an amount within the tolerance, relative to the target', () => {
    expect(SUGGESTION_TOLERANCE).toBe(0.05)
    expect(suggestCategory(row(), [row({ debit: 105, category: 'Fake A' })])?.category).toBe('Fake A')
    expect(suggestCategory(row(), [row({ debit: 95, category: 'Fake A' })])?.category).toBe('Fake A')
  })

  it('refuses an amount just outside the tolerance', () => {
    expect(suggestCategory(row(), [row({ debit: 105.01, category: 'Fake A' })])).toBeNull()
    expect(suggestCategory(row(), [row({ debit: 94.99, category: 'Fake A' })])).toBeNull()
  })

  it('picks the closest amount', () => {
    const candidates = [row({ debit: 104, category: 'Fake Far' }), row({ debit: 99, category: 'Fake Near' })]
    expect(suggestCategory(row(), candidates)?.category).toBe('Fake Near')
  })

  it('on a tie, picks the most recent row', () => {
    const candidates = [
      row({ debit: 102, category: 'Fake Old', date: new Date(2030, 0, 1) }),
      row({ debit: 98, category: 'Fake New', date: new Date(2030, 0, 20) }),
      row({ debit: 102, category: 'Fake Older', date: new Date(2029, 5, 1) }),
    ]
    expect(suggestCategory(row(), candidates)).toEqual({
      category: 'Fake New',
      fromAmount: 98,
      fromDate: new Date(2030, 0, 20),
    })
  })

  it('needs the same direction', () => {
    const credit = row({ debit: 0, credit: 100, category: 'Fake Income' })
    expect(suggestCategory(row(), [credit])).toBeNull()
    expect(suggestCategory(row({ debit: 0, credit: 100 }), [credit])?.category).toBe('Fake Income')
  })

  it('needs exactly the same original description', () => {
    const candidates = [
      row({ originalDescription: 'FAKE CHEQUE 2', category: 'Fake A' }),
      row({ originalDescription: 'fake cheque', category: 'Fake A' }),
      // The display name doesn't count, only the bank's text
      row({ originalDescription: 'FAKE OTHER', description: 'FAKE CHEQUE', category: 'Fake A' }),
    ]
    expect(suggestCategory(row(), candidates)).toBeNull()
  })

  it('skips ignored and uncategorized candidates, and the target itself', () => {
    const target = row({ category: null })
    const candidates = [
      target,
      row({ category: null }),
      row({ category: 'Fake Hidden', ignored: true }),
    ]
    expect(suggestCategory(target, candidates)).toBeNull()
  })

  it('gives no suggestion to a categorized, ignored or card-payment row', () => {
    const from = row({ category: 'Fake A' })
    expect(suggestCategory(row({ category: 'Fake B' }), [from])).toBeNull()
    expect(suggestCategory(row({ ignored: true }), [from])).toBeNull()
    const payment = { originalDescription: 'MAX IT', description: 'MAX IT' }
    expect(suggestCategory(row(payment), [row({ ...payment, category: 'Fake A' })])).toBeNull()
  })
})

describe('suggestCategories', () => {
  it('maps each row that has a suggestion to it', () => {
    const a = row({ originalDescription: 'FAKE A' })
    const b = row({ originalDescription: 'FAKE B', debit: 0, credit: 500 })
    const c = row({ originalDescription: 'FAKE C' })
    const history = [
      row({ originalDescription: 'FAKE A', debit: 101, category: 'Fake Cat A' }),
      row({ originalDescription: 'FAKE B', debit: 0, credit: 490, category: 'Fake Cat B' }),
    ]
    const out = suggestCategories([a, b, c], history)
    expect([...out.keys()].sort()).toEqual([a.id, b.id].sort())
    expect(out.get(a.id)?.category).toBe('Fake Cat A')
    expect(out.get(b.id)?.fromAmount).toBe(490)
  })
})
