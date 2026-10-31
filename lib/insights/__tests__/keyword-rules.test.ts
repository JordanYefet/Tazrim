import { describe, expect, it } from 'vitest'
import {
  keywordMatches,
  keywordRuleFor,
  normalizeKeyword,
  resolveRuleCategory,
  suggestKeyword,
  validKeyword,
  type KeywordRule,
  type RuleRow,
} from '../keyword-rules'

// Made-up merchants and categories only.

const rule = (pattern: string, category: string, over: Partial<KeywordRule> = {}): KeywordRule => ({
  pattern,
  category,
  kind: 'EXPENSE',
  createdAt: new Date(2030, 0, 1),
  ...over,
})

const card = (originalMerchantName: string): RuleRow => ({ source: 'card', originalMerchantName })
const bank = (originalDescription: string, over: Partial<{ debit: number; credit: number; generic: boolean; description: string }> = {}): RuleRow => ({
  source: 'bank',
  originalDescription,
  description: over.description ?? originalDescription,
  debit: over.debit ?? 100,
  credit: over.credit ?? 0,
  generic: over.generic ?? false,
})

describe('normalizeKeyword / validKeyword', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeKeyword('  ACME   MUSIC \t')).toBe('ACME MUSIC')
  })
  it('needs at least two characters', () => {
    expect(validKeyword(' a ')).toBe(false)
    expect(validKeyword('ab')).toBe(true)
  })
})

describe('keywordMatches', () => {
  it('matches a substring, ignoring case and runs of whitespace', () => {
    expect(keywordMatches('acme music', 'ACME  MUSIC P12345 TESTVILLE')).toBe(true)
    expect(keywordMatches('MUSIC P1', 'acme music p12345 testville')).toBe(true)
    expect(keywordMatches('ACME RADIO', 'ACME MUSIC P12345 TESTVILLE')).toBe(false)
  })
  it('matches Hebrew text', () => {
    expect(keywordMatches('מוזיקה', 'אפליקציית מוזיקה לדוגמה')).toBe(true)
  })
  it('never matches a pattern that is too short', () => {
    expect(keywordMatches('A', 'ACME')).toBe(false)
  })
})

describe('keywordRuleFor', () => {
  it('picks the longest matching pattern', () => {
    const rules = [rule('ACME', 'Fake Shops'), rule('ACME MUSIC', 'Fake Phone'), rule('MUSIC', 'Fake Fun')]
    expect(keywordRuleFor('ACME MUSIC P12345 TESTVILLE', rules, 'EXPENSE')?.category).toBe('Fake Phone')
  })
  it('breaks a tie by the oldest rule', () => {
    const rules = [
      rule('MUSIC', 'Fake Newer', { createdAt: new Date(2030, 5, 1) }),
      rule('P1234', 'Fake Older', { createdAt: new Date(2030, 0, 1) }),
    ]
    expect(keywordRuleFor('ACME MUSIC P12345', rules, 'EXPENSE')?.category).toBe('Fake Older')
  })
  it('only considers rules of the asked kind', () => {
    const rules = [rule('ACME', 'Fake Refunds', { kind: 'INCOME' })]
    expect(keywordRuleFor('ACME REFUND', rules, 'EXPENSE')).toBeNull()
    expect(keywordRuleFor('ACME REFUND', rules, 'INCOME')?.category).toBe('Fake Refunds')
  })
})

describe('resolveRuleCategory', () => {
  const rules = [
    rule('ACME', 'Fake Phone'),
    rule('ACME', 'Fake Refunds', { kind: 'INCOME', createdAt: new Date(2030, 0, 2) }),
  ]

  it('prefers the exact rule over a contains rule', () => {
    expect(resolveRuleCategory(card('ACME MUSIC P1'), 'Fake Exact', rules)).toBe('Fake Exact')
    expect(resolveRuleCategory(bank('ACME DEBIT'), 'Fake Exact', rules)).toBe('Fake Exact')
  })
  it('falls back to the contains rule, then to none', () => {
    expect(resolveRuleCategory(card('ACME MUSIC P1'), null, rules)).toBe('Fake Phone')
    expect(resolveRuleCategory(card('OTHER SHOP'), null, rules)).toBeNull()
  })
  it('lets the direction pick the kind on the bank', () => {
    expect(resolveRuleCategory(bank('ACME TRANSFER', { debit: 50 }), null, rules)).toBe('Fake Phone')
    expect(resolveRuleCategory(bank('ACME TRANSFER', { debit: 0, credit: 50 }), null, rules)).toBe('Fake Refunds')
  })
  it('never categorises a card payment or a generic description, even with an exact rule', () => {
    const payment = bank('ACME', { description: 'מקס איט פיננסים' })
    expect(resolveRuleCategory(payment, null, rules)).toBeNull()
    expect(resolveRuleCategory(bank('ACME CHEQUE', { generic: true }), 'Fake Exact', rules)).toBeNull()
  })
})

describe('suggestKeyword', () => {
  it('takes the first word of three letters or more', () => {
    expect(suggestKeyword('ACME P12345 TESTVILLE SE')).toBe('ACME')
    expect(suggestKeyword('PP 12 ACME')).toBe('ACME')
    expect(suggestKeyword('אפליקציית מוזיקה')).toBe('אפליקציית')
  })
  it('falls back to the whole text', () => {
    expect(suggestKeyword(' 12  34 ')).toBe('12 34')
  })
})
