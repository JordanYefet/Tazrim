import { describe, expect, it } from 'vitest'
import { formatPrivacyCookie, isPrivacyShortcut, parsePrivacyCookie } from '../privacy'

const key = (over: Partial<KeyboardEvent>) => ({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, code: '', ...over })

describe('privacy cookie', () => {
  it('is on only for "on"', () => {
    expect(parsePrivacyCookie('on')).toBe(true)
    expect(parsePrivacyCookie('off')).toBe(false)
    expect(parsePrivacyCookie(undefined)).toBe(false)
    expect(parsePrivacyCookie('yes')).toBe(false)
  })

  it('round-trips', () => {
    expect(parsePrivacyCookie(formatPrivacyCookie(true))).toBe(true)
    expect(parsePrivacyCookie(formatPrivacyCookie(false))).toBe(false)
  })
})

describe('privacy shortcut', () => {
  it('is ⌘⇧. or Ctrl+Shift+.', () => {
    expect(isPrivacyShortcut(key({ metaKey: true, shiftKey: true, code: 'Period' }))).toBe(true)
    expect(isPrivacyShortcut(key({ ctrlKey: true, shiftKey: true, code: 'Period' }))).toBe(true)
  })

  it('needs the modifier and Shift, and no Alt', () => {
    expect(isPrivacyShortcut(key({ shiftKey: true, code: 'Period' }))).toBe(false)
    expect(isPrivacyShortcut(key({ metaKey: true, code: 'Period' }))).toBe(false)
    expect(isPrivacyShortcut(key({ metaKey: true, shiftKey: true, altKey: true, code: 'Period' }))).toBe(false)
    expect(isPrivacyShortcut(key({ metaKey: true, shiftKey: true, code: 'Comma' }))).toBe(false)
  })
})
