import { describe, expect, it } from 'vitest'
import { topWithOther } from '../projection-categories'

// Made-up values only
const cats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `c${i}`, monthlyAmount: 100 - i }))

describe('topWithOther', () => {
  it('keeps a short list as it is', () => {
    expect(topWithOther(cats(8))).toEqual(cats(8))
  })

  it('adds up everything past the seventh as "אחר"', () => {
    const out = topWithOther(cats(10))
    expect(out).toHaveLength(8)
    expect(out[7]).toEqual({ name: 'אחר', monthlyAmount: 93 + 92 + 91 })
  })
})
