import { describe, it, expect } from 'vitest'
import { unusualFlagLabel, unusualFlagDetail } from '../unusual-copy'
import { formatCurrencyWhole } from '@/lib/utils/currency'

describe('unusual flag copy', () => {
  it('labels each reason in Hebrew', () => {
    expect(unusualFlagLabel({ reason: 'merchant_outlier', baseline: 50, ratio: 4, historyCount: 5, maxPrior: 60 })).toBe('חריג לבית העסק')
    expect(
      unusualFlagLabel({ reason: 'category_outlier', category: 'מזון', baseline: 50, ratio: 4, historyCount: 5, maxPrior: 60 })
    ).toBe('חריג לקטגוריה')
    expect(unusualFlagLabel({ reason: 'possible_duplicate', duplicateOfId: 'x', daysApart: 0 })).toBe('חיוב כפול?')
  })

  it('explains the numbers behind the flag', () => {
    expect(unusualFlagDetail({ reason: 'merchant_outlier', baseline: 43.5, ratio: 9.66, historyCount: 4, maxPrior: 50 })).toBe(
      `פי 9.7 מהרגיל בבית העסק (בדרך כלל ${formatCurrencyWhole(44)}, לפי 4 חיובים קודמים)`
    )
    expect(
      unusualFlagDetail({ reason: 'category_outlier', category: 'מזון', baseline: 220, ratio: 8.18, historyCount: 5, maxPrior: 250 })
    ).toBe(`פי 8.2 מהרגיל בקטגוריה מזון (בדרך כלל ${formatCurrencyWhole(220)})`)
    expect(unusualFlagDetail({ reason: 'possible_duplicate', duplicateOfId: 'x', daysApart: 0 })).toBe(
      'אותו סכום באותו בית עסק באותו יום'
    )
    expect(unusualFlagDetail({ reason: 'possible_duplicate', duplicateOfId: 'x', daysApart: 2 })).toBe(
      'אותו סכום באותו בית עסק לפני 2 ימים'
    )
    expect(unusualFlagDetail({ reason: 'possible_duplicate', duplicateOfId: 'x', daysApart: 1 })).toBe(
      'אותו סכום באותו בית עסק יום קודם'
    )
  })
})
