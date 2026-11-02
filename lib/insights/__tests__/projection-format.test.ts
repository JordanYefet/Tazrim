import { describe, expect, it } from 'vitest'
import { monthLabel, tightLine } from '../projection-format'
import type { ProjectedMonth } from '../projection'

const m = (month: string, low: number): ProjectedMonth => ({
  month, income: 0, expense: 0, net: 0, expected: low, low, high: low, stale: false, tight: true,
})

describe('projection copy', () => {
  it('labels months short, with the year', () => {
    expect(monthLabel('2031-03')).toMatch(/31$/)
  })

  it('says nothing when no month is tight', () => {
    expect(tightLine([])).toBeNull()
  })

  it('names the lowest tight month and counts the rest', () => {
    const line = tightLine([m('2030-09', 800), m('2030-10', -200), m('2030-11', 400)])!
    expect(line).toContain(monthLabel('2030-10'))
    expect(line).toContain('ועוד 2 חודשים')
  })

  it('names a single tight month without a count', () => {
    expect(tightLine([m('2030-09', 800)])).not.toContain('ועוד')
  })
})
