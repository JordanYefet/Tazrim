import { describe, expect, it } from 'vitest'
import { CARD_PAYMENT_CATEGORY, mergeCategoryStats, UNCATEGORIZED } from '../bank-categories'

// The overview's donut: card charges and bank debits together. Made-up values only.
describe('mergeCategoryStats', () => {
  it('adds totals and counts per category and leaves out the card payment', () => {
    const cards = { Food: { total: 300, count: 3 }, Fuel: { total: 200, count: 1 } }
    const bank = {
      Food: { total: 100, count: 1 },
      [UNCATEGORIZED]: { total: 50, count: 2 },
      [CARD_PAYMENT_CATEGORY]: { total: 500, count: 1 },
    }
    expect(mergeCategoryStats(cards, bank)).toEqual({
      Food: { total: 400, count: 4 },
      Fuel: { total: 200, count: 1 },
      [UNCATEGORIZED]: { total: 50, count: 2 },
    })
  })
})
