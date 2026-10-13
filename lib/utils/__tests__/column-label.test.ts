import { describe, it, expect } from 'vitest'
import { columnLabel } from '../column-label'

describe('columnLabel', () => {
  it('maps zero-based indexes to spreadsheet letters', () => {
    expect(columnLabel(0)).toBe('A')
    expect(columnLabel(25)).toBe('Z')
    expect(columnLabel(26)).toBe('AA')
    expect(columnLabel(27)).toBe('AB')
    expect(columnLabel(701)).toBe('ZZ')
    expect(columnLabel(702)).toBe('AAA')
  })
})
