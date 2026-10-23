import { describe, expect, it } from 'vitest'
import { monthBars } from '../month-bars'

// Made-up monthly values
const values = { 1: 100, 2: 50, 3: 200, 4: 0, 5: 150 }

describe('monthBars', () => {
  it('scales heights to the largest month and marks the months after the latest with data as future', () => {
    const { bars, lastMonth } = monthBars(values)
    expect(bars).toHaveLength(12)
    expect(lastMonth).toBe(5)
    expect(bars.map(b => b.height).slice(0, 5)).toEqual([0.5, 0.25, 1, 0, 0.75])
    expect(bars.filter(b => b.future).map(b => b.month)).toEqual([6, 7, 8, 9, 10, 11, 12])
    expect(bars.slice(5).every(b => b.height === 0)).toBe(true)
    // A past month without charges is not the future
    expect(bars[3].future).toBe(false)
  })

  it('highlights the latest month with data when no month is selected', () => {
    const r = monthBars(values)
    expect(r.highlightMonth).toBe(5)
    expect(r.bars.filter(b => b.highlight).map(b => b.month)).toEqual([5])
  })

  it('highlights the selected month even when it has no data', () => {
    const r = monthBars(values, { selectedMonth: 4 })
    expect(r.highlightMonth).toBe(4)
    expect(r.bars[3]).toMatchObject({ highlight: true, height: 0, future: false })

    const ahead = monthBars(values, { selectedMonth: 9 })
    expect(ahead.bars[8]).toMatchObject({ highlight: true, future: true, height: 0 })
  })

  it('handles a year with no values at all', () => {
    const r = monthBars({}, { average: true })
    expect(r.lastMonth).toBe(0)
    expect(r.highlightMonth).toBeUndefined()
    expect(r.averageAt).toBeNull()
    expect(r.bars.every(b => b.height === 0 && b.future && !b.highlight)).toBe(true)
    expect(monthBars({ 3: 0 }, { average: 0 }).averageAt).toBeNull()
  })

  it('puts the average line at the average over months with data, or at a given value', () => {
    // (100 + 50 + 200 + 150) / 4 = 125, of a max of 200
    expect(monthBars(values, { average: true }).averageAt).toBeCloseTo(0.625)
    expect(monthBars(values, { average: 100 }).averageAt).toBeCloseTo(0.5)
    expect(monthBars(values).averageAt).toBeNull()
  })

  it('keeps an average above every bar inside the chart', () => {
    const r = monthBars({ 1: 50, 2: 100 }, { average: 200 })
    expect(r.averageAt).toBe(1)
    expect(r.bars[1].height).toBe(0.5)
  })

  it('accepts string month keys and ignores negative values', () => {
    const r = monthBars({ '2': 40, '3': -10 } as unknown as Record<number, number>)
    expect(r.bars[1].value).toBe(40)
    expect(r.bars[2].value).toBe(0)
    expect(r.lastMonth).toBe(2)
  })

  it('labels the first, last and highlighted months; an end label gives way beside the highlight', () => {
    const labels = (selectedMonth?: number) =>
      monthBars({ ...values, 12: 10 }, { selectedMonth }).bars.filter(b => b.label).map(b => b.label)
    expect(labels(6)).toEqual(['ינו׳', 'יוני', 'דצמ׳'])
    expect(labels(2)).toEqual(['פבר׳', 'דצמ׳'])
    expect(labels(1)).toEqual(['ינו׳', 'דצמ׳'])
    expect(labels(11)).toEqual(['ינו׳', 'נוב׳'])
  })
})
