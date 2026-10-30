import { describe, expect, it } from 'vitest'
import { analysisScopeOptions, resolveAnalysisScope } from '../analysis-scope'

// Made-up accounts only
const banks = [{ id: 'b1', label: 'Bank one' }, { id: 'b2', label: 'Bank two' }]
const cards = [{ id: 'c1', label: 'Card one' }]

describe('resolveAnalysisScope', () => {
  it('reads everything by default, and for anything unknown', () => {
    expect(resolveAnalysisScope(undefined, { banks, cards })).toEqual({ value: '', bankIds: ['b1', 'b2'], cardIds: ['c1'] })
    expect(resolveAnalysisScope('nope', { banks, cards })).toEqual({ value: '', bankIds: ['b1', 'b2'], cardIds: ['c1'] })
  })

  it('narrows to the bank, the cards, or one account', () => {
    expect(resolveAnalysisScope('bank', { banks, cards })).toEqual({ value: 'bank', bankIds: ['b1', 'b2'], cardIds: [] })
    expect(resolveAnalysisScope('cards', { banks, cards })).toEqual({ value: 'cards', bankIds: [], cardIds: ['c1'] })
    expect(resolveAnalysisScope('b2', { banks, cards })).toEqual({ value: 'b2', bankIds: ['b2'], cardIds: [] })
    expect(resolveAnalysisScope('c1', { banks, cards })).toEqual({ value: 'c1', bankIds: [], cardIds: ['c1'] })
  })
})

describe('analysisScopeOptions', () => {
  it('lists everything, the bank and its accounts, then the cards', () => {
    expect(analysisScopeOptions({ banks, cards }).map(o => o.label)).toEqual(['הכל', 'כל הבנקים', 'Bank one', 'Bank two', 'Card one'])
  })

  it('offers no chips with a single account', () => {
    expect(analysisScopeOptions({ banks: [], cards })).toEqual([])
  })
})
