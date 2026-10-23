import { describe, expect, it } from 'vitest'
import { insightsScopeOptions, resolveInsightsScope, scopeAccounts, scopeParam } from '../insights-scope'

// Made-up account ids only
const accounts = { bankIds: ['acct_b'], cardIds: ['acct_c1', 'acct_c2'] }

describe('resolveInsightsScope', () => {
  it('reads the param, falling back to bank and cards together', () => {
    expect(resolveInsightsScope(undefined, accounts)).toEqual({ kind: 'all' })
    expect(resolveInsightsScope('bank', accounts)).toEqual({ kind: 'bank' })
    expect(resolveInsightsScope('cards', accounts)).toEqual({ kind: 'cards' })
    expect(resolveInsightsScope('acct_c2', accounts)).toEqual({ kind: 'card', id: 'acct_c2' })
    expect(resolveInsightsScope('acct_gone', accounts)).toEqual({ kind: 'all' })
    expect(resolveInsightsScope('bank', { bankIds: [], cardIds: ['acct_c1'] })).toEqual({ kind: 'all' })
  })

  it('round-trips through the param and names the accounts it reads', () => {
    for (const p of [undefined, 'bank', 'cards', 'acct_c1']) expect(scopeParam(resolveInsightsScope(p, accounts))).toBe(p)
    expect(scopeAccounts({ kind: 'all' }, accounts)).toEqual(accounts)
    expect(scopeAccounts({ kind: 'bank' }, accounts)).toEqual({ bankIds: ['acct_b'], cardIds: [] })
    expect(scopeAccounts({ kind: 'card', id: 'acct_c1' }, accounts)).toEqual({ bankIds: [], cardIds: ['acct_c1'] })
  })
})

describe('insightsScopeOptions', () => {
  const card = (id: string) => ({ id, label: `Card ${id}` })

  it('needs two sources to filter between', () => {
    expect(insightsScopeOptions({ hasBank: true, cards: [] })).toEqual([])
    expect(insightsScopeOptions({ hasBank: false, cards: [card('c1')] })).toEqual([])
  })

  it('bank and one card: all, bank, the card', () => {
    expect(insightsScopeOptions({ hasBank: true, cards: [card('c1')] }).map(o => o.value)).toEqual([undefined, 'bank', 'c1'])
  })

  it('several cards add an every-card chip', () => {
    expect(insightsScopeOptions({ hasBank: true, cards: [card('c1'), card('c2')] }).map(o => o.value)).toEqual([
      undefined, 'bank', 'cards', 'c1', 'c2',
    ])
    // No bank: "all" already is every card
    expect(insightsScopeOptions({ hasBank: false, cards: [card('c1'), card('c2')] })).toEqual([
      { value: undefined, label: 'כל הכרטיסים' },
      { value: 'c1', label: 'Card c1' },
      { value: 'c2', label: 'Card c2' },
    ])
  })
})

describe('parseBankFlow', () => {
  it('reads in / out, anything else is both', async () => {
    const { parseBankFlow } = await import('../bank-categories')
    expect(parseBankFlow('in')).toBe('IN')
    expect(parseBankFlow('out')).toBe('OUT')
    expect(parseBankFlow('all')).toBeUndefined()
    expect(parseBankFlow(undefined)).toBeUndefined()
  })
})
