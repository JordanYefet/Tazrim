import { describe, it, expect } from 'vitest'
import { THEME_OPTIONS, normalizeTheme, stepTheme } from '../theme'

describe('THEME_OPTIONS', () => {
  it('lists light, dark, system in order with Hebrew labels', () => {
    expect(THEME_OPTIONS.map(o => o.value)).toEqual(['light', 'dark', 'system'])
    expect(THEME_OPTIONS.map(o => o.label)).toEqual(['בהיר', 'כהה', 'מערכת'])
  })
})

describe('normalizeTheme', () => {
  it('keeps known values', () => {
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme('system')).toBe('system')
  })
  it('falls back to system for unknown or missing values', () => {
    expect(normalizeTheme(undefined)).toBe('system')
    expect(normalizeTheme('')).toBe('system')
    expect(normalizeTheme('sepia')).toBe('system')
  })
})

describe('stepTheme', () => {
  it('moves forward and wraps', () => {
    expect(stepTheme('light', 1)).toBe('dark')
    expect(stepTheme('dark', 1)).toBe('system')
    expect(stepTheme('system', 1)).toBe('light')
  })
  it('moves backward and wraps', () => {
    expect(stepTheme('light', -1)).toBe('system')
    expect(stepTheme('system', -1)).toBe('dark')
  })
})
