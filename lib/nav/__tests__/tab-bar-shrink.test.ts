import { describe, expect, it } from 'vitest'
import { ENGAGE_RELEASE, stillEngaged, tabBarShrunk } from '../tab-bar-shrink'

const base = { headerHidden: true, sheetOpen: false, calm: false, engaged: false }

describe('tabBarShrunk', () => {
  it('shrinks with the header', () => expect(tabBarShrunk(base)).toBe(true))
  it('is full while the header shows (top of the page, any scroll up)', () =>
    expect(tabBarShrunk({ ...base, headerHidden: false })).toBe(false))
  it.each([
    ['the sheet is open', { sheetOpen: true }],
    ['a route just changed', { calm: true }],
    ['it was just touched', { engaged: true }],
  ])('is full when %s', (_, patch) => expect(tabBarShrunk({ ...base, ...patch })).toBe(false))
})

describe('stillEngaged', () => {
  it('holds until the page has moved down a stretch from the touch', () => {
    expect(stillEngaged(300, 300)).toBe(true)
    expect(stillEngaged(300, 300 + ENGAGE_RELEASE)).toBe(true)
    expect(stillEngaged(300, 300 + ENGAGE_RELEASE + 1)).toBe(false)
  })
  it('holds while scrolling back up', () => expect(stillEngaged(300, 100)).toBe(true))
})
