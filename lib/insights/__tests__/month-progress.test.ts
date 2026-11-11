import { describe, expect, it } from 'vitest'
import { finishedMonths, monthProgress } from '../month-progress'

describe('monthProgress', () => {
  const now = new Date('2026-11-11T09:00:00Z')

  it('this month is in progress, with the day of the month', () => {
    expect(monthProgress(2026, 11, now)).toEqual({ inProgress: true, day: 11, daysInMonth: 30 })
  })

  it('a past month is finished', () => {
    expect(monthProgress(2026, 10, now)).toEqual({ inProgress: false, day: 31, daysInMonth: 31 })
    expect(monthProgress(2025, 12, now).inProgress).toBe(false)
  })

  it('a future month has not started', () => {
    expect(monthProgress(2026, 12, now)).toEqual({ inProgress: false, day: 0, daysInMonth: 31 })
    expect(monthProgress(2027, 1, now).inProgress).toBe(false)
  })

  it('follows the Israeli calendar, not the server clock', () => {
    // 22:30 UTC on Oct 31 is already Nov 1 in Israel (UTC+2)
    expect(monthProgress(2026, 11, new Date('2026-10-31T22:30:00Z'))).toMatchObject({ inProgress: true, day: 1 })
    expect(monthProgress(2026, 10, new Date('2026-10-31T22:30:00Z')).inProgress).toBe(false)
  })

  it('knows leap Februaries', () => {
    expect(monthProgress(2028, 2, new Date('2028-02-10T10:00:00Z')).daysInMonth).toBe(29)
  })
})

describe('finishedMonths', () => {
  const now = new Date('2026-11-11T09:00:00Z')
  it('drops the month in progress and later months', () => {
    expect(Object.keys(finishedMonths(2026, { 9: 1, 10: 2, 11: 3, 12: 4 }, now))).toEqual(['9', '10'])
  })
  it('keeps every month of a past year', () => {
    expect(Object.keys(finishedMonths(2025, { 1: 1, 12: 2 }, now))).toEqual(['1', '12'])
  })
})
