import { describe, expect, it } from 'vitest'
import { categorySources, pendingIssuerCategories } from '../category-sources'

// What fills each category automatically, for the categories page. Made-up values only.
const issuer = [
  { provider: 'max', sourceCategory: 'FAKE FOOD', count: 12, category: 'Food' },
  { provider: 'cal', sourceCategory: 'FAKE CARS', count: 3, category: 'Car' },
  { provider: 'max', sourceCategory: 'FAKE PETS', count: 2, category: null },
]
const aliases = [
  { provider: 'max', originalName: 'FAKE GROCER LTD', displayName: 'FAKE GROCER', categoryOverride: 'Food' },
  // A display name only: no category, so it feeds none
  { provider: 'leumi', originalName: 'FAKE TRANSFER', displayName: 'FAKE RENAMED', categoryOverride: null },
]
const bankRules = [
  { provider: 'leumi', originalDescription: 'FAKE WATER', direction: 'OUT', category: 'Home' },
  { provider: 'leumi', originalDescription: 'FAKE EMPLOYER', direction: 'IN', category: 'Salary' },
]

describe('categorySources', () => {
  it('groups issuer mappings, merchant rules and bank rules under the category they set', () => {
    const s = categorySources({ issuer, aliases, bankRules })
    expect(s.Food).toEqual([
      { type: 'issuer', provider: 'max', sourceCategory: 'FAKE FOOD', count: 12 },
      { type: 'merchant', provider: 'max', originalName: 'FAKE GROCER LTD', displayName: 'FAKE GROCER' },
    ])
    expect(s.Car).toEqual([{ type: 'issuer', provider: 'cal', sourceCategory: 'FAKE CARS', count: 3 }])
    expect(s.Home).toEqual([{ type: 'bank', provider: 'leumi', originalDescription: 'FAKE WATER', direction: 'OUT' }])
    expect(s.Salary).toEqual([{ type: 'bank', provider: 'leumi', originalDescription: 'FAKE EMPLOYER', direction: 'IN' }])
  })

  it('leaves out unmapped issuer categories and aliases without a category', () => {
    const s = categorySources({ issuer, aliases, bankRules })
    expect(Object.keys(s).sort()).toEqual(['Car', 'Food', 'Home', 'Salary'])
  })

  it('puts contains-text rules last', () => {
    const keywordRules = [{ id: 'k1', pattern: 'FAKE GROCER', category: 'Food' }]
    const s = categorySources({ issuer, aliases, bankRules, keywordRules })
    expect(s.Food.at(-1)).toEqual({ type: 'keyword', id: 'k1', pattern: 'FAKE GROCER' })
  })
})

describe('pendingIssuerCategories', () => {
  it('lists the issuer categories still waiting for one of yours', () => {
    expect(pendingIssuerCategories(issuer)).toEqual([{ provider: 'max', sourceCategory: 'FAKE PETS', count: 2, category: null }])
  })

  it('leaves out an unmapped issuer category already named like one of yours', () => {
    expect(pendingIssuerCategories(issuer, ['FAKE PETS'])).toEqual([])
  })
})
