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

  it('carries an account idle in the period forward from its balance before it', () => {
    const a = [p('2030-10-20', 10000), p('2030-10-02', 9000)]
    const b: ReturnType<typeof p>[] = []
    expect(combinedBalance([a, b], [undefined, 5000])).toEqual([
      p('2030-10-20', 15000),
      p('2030-10-02', 14000),
    ])
  })

  it('counts an account with rows in the period from its balance before the first row', () => {
    const a = [p('2030-10-20', 10000)]
    const b = [p('2030-10-10', 4000)]
    expect(combinedBalance([a, b], [9500, 5000])).toEqual([
      p('2030-10-20', 14000),
      p('2030-10-10', 13500),
    ])
  })

  it('leaves out an account that has nothing before the period end', () => {
    const a = [p('2030-10-20', 10000), p('2030-10-02', 9000)]
    expect(combinedBalance([a, []], [undefined, undefined])).toEqual(a)
    // starts later than the period: no earlier balance, rows only from its first row on
    const c = [p('2030-10-15', 300)]
    expect(combinedBalance([a, c], [undefined, undefined])).toEqual([
      p('2030-10-20', 10300),
      p('2030-10-15', 9300),
      p('2030-10-02', 9000),
    ])
  })
})
