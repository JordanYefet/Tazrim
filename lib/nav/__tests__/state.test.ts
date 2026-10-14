import { describe, expect, it } from 'vitest'
import {
  SECTIONS_COOKIE,
  SIDEBAR_COOKIE,
  buildNavSections,
  cookieAssignment,
  isMoreActive,
  parseClosedSections,
  parseSidebarCollapsed,
  routeAccountId,
  serializeClosedSections,
  toggleSection,
} from '../state'

describe('parseSidebarCollapsed', () => {
  it('is collapsed only for the stored value', () => {
    expect(parseSidebarCollapsed('collapsed')).toBe(true)
    expect(parseSidebarCollapsed('expanded')).toBe(false)
    expect(parseSidebarCollapsed(undefined)).toBe(false)
    expect(parseSidebarCollapsed('garbage')).toBe(false)
  })
})

describe('closed sections', () => {
  it('parses known keys and drops the rest', () => {
    expect(parseClosedSections('cards')).toEqual(['cards'])
    expect(parseClosedSections('banks,cards')).toEqual(['banks', 'cards'])
    expect(parseClosedSections('banks,,nope,banks')).toEqual(['banks'])
    expect(parseClosedSections(undefined)).toEqual([])
    expect(parseClosedSections('')).toEqual([])
  })

  it('toggles a key in and out', () => {
    expect(toggleSection([], 'banks')).toEqual(['banks'])
    expect(toggleSection(['banks', 'cards'], 'banks')).toEqual(['cards'])
  })

  it('serializes in a stable order', () => {
    expect(serializeClosedSections(['cards', 'banks'])).toBe('banks,cards')
    expect(serializeClosedSections([])).toBe('')
    expect(parseClosedSections(serializeClosedSections(['cards']))).toEqual(['cards'])
  })
})

describe('cookieAssignment', () => {
  it('writes a site-wide, year-long cookie', () => {
    expect(cookieAssignment(SIDEBAR_COOKIE, 'collapsed')).toBe(
      `${SIDEBAR_COOKIE}=collapsed; path=/; max-age=31536000; samesite=lax`
    )
  })

  it('encodes the value', () => {
    expect(cookieAssignment(SECTIONS_COOKIE, 'banks,cards')).toContain('=banks%2Ccards;')
  })
})

describe('routeAccountId', () => {
  it('reads the account id under its section', () => {
    expect(routeAccountId('/cards/acct_test_card', 'CREDIT_CARD')).toBe('acct_test_card')
    expect(routeAccountId('/banks/acct_test_bank', 'BANK')).toBe('acct_test_bank')
  })

  it('decodes encoded ids', () => {
    expect(routeAccountId('/cards/a%20b%2Fc', 'CREDIT_CARD')).toBe('a b/c')
  })

  it('is null on the overview, another section or a deeper path', () => {
    expect(routeAccountId('/cards', 'CREDIT_CARD')).toBeNull()
    expect(routeAccountId('/cards/', 'CREDIT_CARD')).toBeNull()
    expect(routeAccountId('/banks/acct_test_bank', 'CREDIT_CARD')).toBeNull()
    expect(routeAccountId('/cardsx/acct_test_card', 'CREDIT_CARD')).toBeNull()
    expect(routeAccountId('/cards/acct_test_card/extra', 'CREDIT_CARD')).toBeNull()
  })

  it('survives a malformed escape', () => {
    expect(routeAccountId('/cards/%E0%A4%A', 'CREDIT_CARD')).toBe('%E0%A4%A')
  })
})

describe('isMoreActive', () => {
  it('is active on the pages behind עוד', () => {
    for (const p of ['/upload', '/upload/preview', '/categories', '/settings', '/accounts']) {
      expect(isMoreActive(p)).toBe(true)
    }
  })

  it('is not active on the main tabs', () => {
    for (const p of ['/', '/banks', '/cards/acct_test_card', '/recurring', '/search', '/uploads']) {
      expect(isMoreActive(p)).toBe(false)
    }
  })
})

describe('buildNavSections', () => {
  const accounts = [
    { id: 'acct_card_a', kind: 'CREDIT_CARD' as const, displayName: 'Card A', cardLastFour: '0000' },
    { id: 'acct_bank_a', kind: 'BANK' as const, displayName: 'Bank A', cardLastFour: null },
    { id: 'acct_trade', kind: 'TRADING' as const, displayName: 'Broker', cardLastFour: null },
    { id: 'acct_card_b', kind: 'CREDIT_CARD' as const, displayName: 'Card B', cardLastFour: null },
  ]
  const sections = buildNavSections(accounts)

  it('splits banks and cards, in the given order, and skips kinds without pages', () => {
    expect(sections.banks.map(a => a.id)).toEqual(['acct_bank_a'])
    expect(sections.cards.map(a => a.id)).toEqual(['acct_card_a', 'acct_card_b'])
  })

  it('links each account to its page', () => {
    expect(sections.banks[0].href).toBe('/banks/acct_bank_a')
    expect(sections.cards[1].href).toBe('/cards/acct_card_b')
  })

  it('gives cards the overview chart colors by position', () => {
    expect(sections.cards[0].color).toBe('var(--chart-cc)')
    expect(sections.cards[1].color).toBe('var(--chart-1)')
  })

  it('keeps the name and last four digits', () => {
    expect(sections.cards[0]).toMatchObject({ name: 'Card A', lastFour: '0000' })
    expect(sections.banks[0].lastFour).toBeNull()
  })
})
