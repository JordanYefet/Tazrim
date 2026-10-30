import { describe, expect, it } from 'vitest'
import {
  analysisHref,
  bankCategoryAnalysisHref,
  bankCategoryTransactionsHref,
  categoryAnalysisHref,
  categoryTransactionsHref,
  combinedCategoryTransactionsHref,
} from '../category-links'
import { CARD_PAYMENT_CATEGORY, UNCATEGORIZED } from '@/lib/insights/bank-categories'

// Made-up ids and categories only
describe('analysis links', () => {
  it('opens the analysis of everything, keeping the period', () => {
    expect(analysisHref(undefined, { year: '2025', month: '3' })).toBe('/analysis?year=2025&month=3')
  })

  it("opens one card's analysis, or every card's", () => {
    expect(categoryAnalysisHref('acct_test_card', { year: '2025', month: '3' })).toBe('/analysis/acct_test_card?year=2025&month=3')
    expect(categoryAnalysisHref(undefined, { year: '2025' })).toBe('/analysis/cards?year=2025')
  })
})

describe('categoryTransactionsHref', () => {
  it("filters the one card's transactions on its page", () => {
    expect(categoryTransactionsHref({ cardIds: ['acct_a'], category: 'Test food', year: '2025', month: 4 })).toBe(
      '/cards/acct_a?year=2025&month=4&category=Test+food'
    )
  })

  it('searches every card for that category over the period when there are several', () => {
    expect(categoryTransactionsHref({ cardIds: ['acct_a', 'acct_b'], category: 'Test food', year: '2025' })).toBe(
      '/search?from=2025-01-01&to=2025-12-31&account=acct_a&account=acct_b&category=Test+food'
    )
    expect(
      categoryTransactionsHref({ cardIds: ['acct_a', 'acct_b'], category: 'Test food', year: '2024', month: 2 })
    ).toBe('/search?from=2024-02-01&to=2024-02-29&account=acct_a&account=acct_b&category=Test+food')
  })
})

describe('bank category links', () => {
  it("opens one bank account's analysis, or every bank account's", () => {
    expect(bankCategoryAnalysisHref('acct_test_bank', { year: '2025' })).toBe('/analysis/acct_test_bank?year=2025')
    expect(bankCategoryAnalysisHref(undefined, { year: '2025', month: '2' })).toBe('/analysis/bank?year=2025&month=2')
  })

  it("filters one account's page, buckets included", () => {
    expect(bankCategoryTransactionsHref({ accountIds: ['acct_a'], category: 'Test rent', year: '2025', month: 4 })).toBe(
      '/banks/acct_a?year=2025&month=4&category=Test+rent'
    )
    expect(bankCategoryTransactionsHref({ accountIds: ['acct_a'], category: UNCATEGORIZED, year: '2025' })).toBe(
      `/banks/acct_a?year=2025&category=${encodeURIComponent(UNCATEGORIZED).replace(/%20/g, '+')}`
    )
  })

  it('searches several accounts for a real category; a bucket gets no link', () => {
    expect(bankCategoryTransactionsHref({ accountIds: ['acct_a', 'acct_b'], category: 'Test rent', year: '2025' })).toBe(
      '/search?from=2025-01-01&to=2025-12-31&account=acct_a&account=acct_b&category=Test+rent'
    )
    expect(bankCategoryTransactionsHref({ accountIds: ['acct_a', 'acct_b'], category: CARD_PAYMENT_CATEGORY, year: '2025' })).toBeUndefined()
    expect(combinedCategoryTransactionsHref({ accountIds: ['acct_a', 'acct_c'], category: 'Test food', year: '2025', month: 1 })).toBe(
      '/search?from=2025-01-01&to=2025-01-31&account=acct_a&account=acct_c&category=Test+food'
    )
    expect(combinedCategoryTransactionsHref({ accountIds: ['acct_a'], category: UNCATEGORIZED, year: '2025' })).toBeUndefined()
  })
})
