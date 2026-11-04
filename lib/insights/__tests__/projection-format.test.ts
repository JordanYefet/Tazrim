import { describe, expect, it } from 'vitest'
import { monthLabel, tightLine } from '../projection-format'
import type { ProjectedMonth } from '../projection'

const m = (month: string, low: number, stale = false): ProjectedMonth => ({
  month, income: 0, expense: 0, net: 0, expected: low, low, high: low, stale, tight: true,
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
    expect(line).toContain('ועוד חודשיים')
  })

  it('counts one other month and many others in words', () => {
    expect(tightLine([m('2030-09', 800), m('2030-10', -200)])).toContain('(ועוד חודש)')
    expect(tightLine([m('2030-09', 800), m('2030-10', -200), m('2030-11', 400), m('2030-12', 500)])).toContain('ועוד 3 חודשים')
  })

  it('names the lowest month still ahead, counting only those; passed months only when every tight month has passed', () => {
    const line = tightLine([m('2030-07', -900, true), m('2030-08', -500, true), m('2030-09', 800), m('2030-10', 300)])!
    expect(line).toContain(monthLabel('2030-10'))
    expect(line).toContain('(ועוד חודש)')
    const allStale = tightLine([m('2030-07', -900, true), m('2030-08', -500, true)])!
    expect(allStale).toContain(monthLabel('2030-07'))
    expect(allStale).toContain('(ועוד חודש)')
  })

  it('names a single tight month without a count', () => {
    expect(tightLine([m('2030-09', 800)])).not.toContain('ועוד')
  })
})
