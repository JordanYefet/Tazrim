import { describe, expect, it } from 'vitest'
import { combinedBalance } from '../combined-balance'

// Made-up balances only
const p = (date: string, balance: number) => ({ date, balance })

describe('combinedBalance', () => {
  it('returns one account as it is, and nothing for none', () => {
    const one = [p('2030-01-03', 90), p('2030-01-01', 100)]
    expect(combinedBalance([one])).toEqual(one)
    expect(combinedBalance([[], one])).toEqual(one)
    expect(combinedBalance([])).toEqual([])
  })

  it("sums each account's latest balance at every row, newest first", () => {
    const a = [p('2030-01-05', 150), p('2030-01-01', 100)]
    const b = [p('2030-01-03', 20)]
    expect(combinedBalance([a, b])).toEqual([
      p('2030-01-05', 170),
      p('2030-01-03', 120),
      p('2030-01-01', 100),
    ])
  })
})
