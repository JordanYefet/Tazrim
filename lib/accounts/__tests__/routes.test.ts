import { describe, expect, it } from 'vitest'
import {
  accountHref,
  accountIdsParam,
  accountPath,
  isNavActive,
  legacyAccountRedirect,
  settingsAccountsHref,
  toQueryString,
  withQuery,
} from '../routes'

describe('toQueryString', () => {
  it('keeps every param, in order', () => {
    expect(toQueryString({ year: '2025', month: '3', merchant: 'Test shop' })).toBe(
      'year=2025&month=3&merchant=Test+shop'
    )
  })

  it('repeats array values and drops undefined', () => {
    expect(toQueryString({ tag: ['a', 'b'], month: undefined, year: '2024' })).toBe('tag=a&tag=b&year=2024')
  })

  it('keeps empty strings (a param that was present stays present)', () => {
    expect(toQueryString({ search: '' })).toBe('search=')
  })

  it('accepts URLSearchParams', () => {
    expect(toQueryString(new URLSearchParams('year=2023&category=Food+%26+drink'))).toBe(
      'year=2023&category=Food+%26+drink'
    )
  })

  it('is empty for no params', () => {
    expect(toQueryString({})).toBe('')
    expect(toQueryString(undefined)).toBe('')
  })
})

describe('withQuery', () => {
  it('adds a query only when there is one', () => {
    expect(withQuery('/banks', {})).toBe('/banks')
    expect(withQuery('/banks', { year: '2025' })).toBe('/banks?year=2025')
  })
})

describe('accountPath', () => {
  it('builds overview and per-account paths', () => {
    expect(accountPath('BANK')).toBe('/banks')
    expect(accountPath('BANK', 'acct_test_bank')).toBe('/banks/acct_test_bank')
    expect(accountPath('CREDIT_CARD')).toBe('/cards')
    expect(accountPath('CREDIT_CARD', 'acct_test_card')).toBe('/cards/acct_test_card')
  })

  it('encodes ids', () => {
    expect(accountPath('CREDIT_CARD', 'a b/c')).toBe('/cards/a%20b%2Fc')
  })
})

describe('accountHref', () => {
  it('carries the given params', () => {
    expect(accountHref('BANK', 'acct_test_bank', { year: '2025', month: '4' })).toBe(
      '/banks/acct_test_bank?year=2025&month=4'
    )
    expect(accountHref('CREDIT_CARD', undefined, { year: '2025' })).toBe('/cards?year=2025')
  })
})

describe('legacyAccountRedirect', () => {
  it('sends the old page to the default account, keeping every param', () => {
    expect(
      legacyAccountRedirect('CREDIT_CARD', 'acct_test_card', {
        year: '2025',
        month: '2',
        category: 'Test category',
        merchant: 'Test shop',
        showIgnored: 'true',
      })
    ).toBe('/cards/acct_test_card?year=2025&month=2&category=Test+category&merchant=Test+shop&showIgnored=true')
  })

  it('falls back to the overview when there is no default account', () => {
    expect(legacyAccountRedirect('BANK', null, { year: '2024' })).toBe('/banks?year=2024')
    expect(legacyAccountRedirect('BANK', undefined, {})).toBe('/banks')
  })
})

describe('isNavActive', () => {
  it('matches the dashboard only exactly', () => {
    expect(isNavActive('/', '/')).toBe(true)
    expect(isNavActive('/banks', '/')).toBe(false)
  })

  it('matches a section and its sub-pages', () => {
    expect(isNavActive('/banks', '/banks')).toBe(true)
    expect(isNavActive('/banks/acct_test_bank', '/banks')).toBe(true)
    expect(isNavActive('/cards/acct_test_card', '/cards')).toBe(true)
  })

  it('does not match a different section that shares a prefix', () => {
    expect(isNavActive('/banksy', '/banks')).toBe(false)
    expect(isNavActive('/categories', '/cards')).toBe(false)
  })
})

describe('settingsAccountsHref', () => {
  it('points at the accounts section of /settings', () => {
    expect(settingsAccountsHref({})).toBe('/settings#accounts')
    expect(settingsAccountsHref(undefined)).toBe('/settings#accounts')
  })

  it('keeps ?new= and any other param (the old /accounts redirect)', () => {
    expect(settingsAccountsHref({ new: 'card' })).toBe('/settings?new=card#accounts')
    expect(settingsAccountsHref({ new: 'BANK', extra: ['a', 'b'] })).toBe('/settings?new=BANK&extra=a&extra=b#accounts')
  })
})

describe('accountIdsParam', () => {
  it('reads one account, several, or none (every account)', () => {
    expect(accountIdsParam(new URLSearchParams('accountId=acct_a&year=2030'))).toBe('acct_a')
    expect(accountIdsParam(new URLSearchParams('accountId=acct_a&accountId=acct_b'))).toEqual(['acct_a', 'acct_b'])
    expect(accountIdsParam(new URLSearchParams('year=2030'))).toBeUndefined()
    expect(accountIdsParam(new URLSearchParams('accountId='))).toBeUndefined()
  })
})
