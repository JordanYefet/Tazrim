import { describe, it, expect } from 'vitest'
import { computeCategoryInsights, latestMonthWithData, rankCategories } from '../category-insights'

// category -> month (1-12) -> amount
const monthly = {
  'מזון וצריכה': { 1: 3000, 2: 3200, 3: 3100, 4: 3100 },
  'מסעדות': { 1: 1000, 2: 1000, 3: 1000, 4: 1500 },
  'עירייה': { 1: 500, 2: 500, 3: 500, 4: 6500 },
  'רפואה': { 1: 1000, 2: 1000, 3: 1000, 4: 300 },
  'חדש': { 4: 800 },
  'זניח': { 1: 100, 2: 100, 3: 100, 4: 160 },
}

describe('computeCategoryInsights', () => {
  it('compares the target month to the average of earlier months with data', () => {
    const r = computeCategoryInsights(monthly, 4)!
    expect(r.month).toBe(4)
    expect(r.baselineMonths).toEqual([1, 2, 3])
    const restaurants = r.items.find(i => i.category === 'מסעדות')!
    expect(restaurants.current).toBe(1500)
    expect(restaurants.average).toBe(1000)
    expect(restaurants.delta).toBe(500)
    expect(restaurants.deltaPct).toBeCloseTo(0.5)
    expect(restaurants.kind).toBe('up')
  })

  it('flags large one-off jumps as spikes', () => {
    const r = computeCategoryInsights(monthly, 4)!
    expect(r.items.find(i => i.category === 'עירייה')!.kind).toBe('spike')
  })

  it('flags drops and categories with no history', () => {
    const r = computeCategoryInsights(monthly, 4)!
    expect(r.items.find(i => i.category === 'רפואה')!.kind).toBe('down')
    const fresh = r.items.find(i => i.category === 'חדש')!
    expect(fresh.kind).toBe('new')
    expect(fresh.deltaPct).toBeNull()
  })

  it('ignores small or stable changes', () => {
    const r = computeCategoryInsights(monthly, 4)!
    const names = r.items.map(i => i.category)
    expect(names).not.toContain('מזון וצריכה') // 0% change
    expect(names).not.toContain('זניח') // +60% but only ₪60
  })

  it('sorts by absolute shekel change, biggest first', () => {
    const r = computeCategoryInsights(monthly, 4)!
    expect(r.items.map(i => i.category)).toEqual(['עירייה', 'חדש', 'רפואה', 'מסעדות'])
  })

  it('counts a missing category in a baseline month as zero spend', () => {
    const r = computeCategoryInsights({ a: { 1: 900, 3: 900 }, b: { 1: 10, 2: 10, 3: 10 } }, 3)!
    // a: baseline months 1,2 → (900 + 0) / 2 = 450
    expect(r.items.find(i => i.category === 'a')!.average).toBe(450)
  })

  it('returns null without at least two baseline months', () => {
    expect(computeCategoryInsights({ a: { 1: 100, 2: 500 } }, 2)).toBeNull()
    expect(computeCategoryInsights({ a: { 1: 100 } }, 1)).toBeNull()
  })

  it('returns null when the target month has no data', () => {
    expect(computeCategoryInsights(monthly, 7)).toBeNull()
  })

  it('caps the list length', () => {
    const r = computeCategoryInsights(monthly, 4, { limit: 2 })!
    expect(r.items).toHaveLength(2)
  })
})

describe('latestMonthWithData', () => {
  it('finds the last month with any spend', () => {
    expect(latestMonthWithData(monthly)).toBe(4)
    expect(latestMonthWithData({})).toBeNull()
  })
})

describe('rankCategories', () => {
  it('orders categories by total spend, descending', () => {
    expect(rankCategories({ a: { 1: 10 }, b: { 1: 50, 2: 5 }, c: { 2: 30 } })).toEqual(['b', 'c', 'a'])
  })
})
