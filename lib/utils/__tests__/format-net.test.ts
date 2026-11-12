import { describe, expect, it } from 'vitest'
import { formatCurrencyWhole, formatNet } from '../currency'

const plain = (s: string) => s.replace(/[‎‏]/g, '')

describe('formatNet', () => {
  it('signs a net in whole shekels, with a true minus', () => {
    expect(formatNet(5521.6)).toBe(`+${plain(formatCurrencyWhole(5522))}`)
    expect(formatNet(-410)).toBe(`−${plain(formatCurrencyWhole(410))}`)
  })

  it('has no direction marks, so the sign stays with the number', () => {
    expect(formatNet(5522)).not.toMatch(/[‎‏]/)
  })

  it('has no sign at zero, also when it rounds to zero', () => {
    expect(formatNet(0.3)).toBe(plain(formatCurrencyWhole(0)))
  })
})
