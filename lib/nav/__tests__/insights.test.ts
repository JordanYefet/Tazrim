import { describe, expect, it } from 'vitest'
import { insightsPageOf, isInsightsActive, parseInsightsChoice } from '../insights'

describe('insights tab', () => {
  it('is active on the three pages and their sub-paths', () => {
    for (const p of ['/projection', '/recurring', '/analysis', '/analysis/bank', '/analysis/bank/acct_test_bank']) {
      expect(isInsightsActive(p)).toBe(true)
    }
  })

  it('is not active elsewhere', () => {
    for (const p of ['/', '/banks', '/cards/acct_test_card', '/upload', '/settings', '/projections', '/recurringx']) {
      expect(isInsightsActive(p)).toBe(false)
    }
  })

  it('names the page a path belongs to', () => {
    expect(insightsPageOf('/analysis/cards')).toBe('/analysis')
    expect(insightsPageOf('/recurring')).toBe('/recurring')
    expect(insightsPageOf('/')).toBeNull()
  })

  it('trusts only a stored page, else the default', () => {
    expect(parseInsightsChoice('/recurring')).toBe('/recurring')
    expect(parseInsightsChoice('/analysis')).toBe('/analysis')
    expect(parseInsightsChoice('/settings')).toBe('/projection')
    expect(parseInsightsChoice('')).toBe('/projection')
    expect(parseInsightsChoice(null)).toBe('/projection')
    expect(parseInsightsChoice(undefined)).toBe('/projection')
  })
})
