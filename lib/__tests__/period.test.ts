import { describe, expect, it } from 'vitest'
import {
  formatPeriodCookie,
  stepPeriod,
  isPeriodPath,
  parsePeriodCookie,
  periodFromParams,
  resolvePeriod,
  withPeriod,
} from '../period'

const now = new Date(2030, 9, 20)
const hasData = (years: number[]) => (y: number) => years.includes(y)

describe('resolvePeriod: URL, then cookie, then default', () => {
  it('the URL wins over the cookie', async () => {
    expect(await resolvePeriod({ year: '2029', month: '4' }, '2028-7', { now })).toEqual({
      year: 2029,
      month: 4,
      source: 'url',
    })
  })

  it('a year without a month in the URL is all months, even when the cookie has a month', async () => {
    expect(await resolvePeriod({ year: '2029' }, '2029-7', { now })).toEqual({ year: 2029, month: undefined, source: 'url' })
  })

  it('a month without a year takes the remembered year', async () => {
    expect(await resolvePeriod({ month: '5' }, '2028-7', { now })).toEqual({ year: 2028, month: 5, source: 'url' })
    expect(await resolvePeriod({ month: '5' }, undefined, { now })).toEqual({ year: 2030, month: 5, source: 'url' })
  })

  it('no URL period: the cookie', async () => {
    expect(await resolvePeriod({}, '2029-3', { now, yearHasData: hasData([2029]) })).toEqual({
      year: 2029,
      month: 3,
      source: 'cookie',
    })
  })

  it('"all months" is a valid remembered value', async () => {
    expect(await resolvePeriod(undefined, '2029', { now, yearHasData: hasData([2029]) })).toEqual({
      year: 2029,
      source: 'cookie',
    })
  })

  it('no URL period and no cookie: the current year, all months', async () => {
    expect(await resolvePeriod({}, undefined, { now })).toEqual({ year: 2030, source: 'default' })
    expect(await resolvePeriod(new URLSearchParams(''), null, { now })).toEqual({ year: 2030, source: 'default' })
  })

  it('a remembered year without data falls back to the current year', async () => {
    expect(await resolvePeriod({}, '2027-2', { now, yearHasData: hasData([2030]) })).toEqual({
      year: 2030,
      source: 'default',
    })
  })

  it('the remembered current year is kept even before it has data', async () => {
    expect(await resolvePeriod({}, '2030-1', { now, yearHasData: hasData([]) })).toEqual({
      year: 2030,
      month: 1,
      source: 'cookie',
    })
  })

  it('an explicit URL year is shown even without data (the page says it is empty)', async () => {
    expect(await resolvePeriod({ year: '2027' }, undefined, { now, yearHasData: hasData([]) })).toMatchObject({
      year: 2027,
      source: 'url',
    })
  })

  it('ignores invalid URL params and cookies', async () => {
    expect(await resolvePeriod({ year: 'abc', month: '13' }, 'junk', { now })).toEqual({ year: 2030, source: 'default' })
    expect(await resolvePeriod({ year: ['2029', '2028'] }, undefined, { now })).toMatchObject({ year: 2029, source: 'url' })
  })

  it('reads URLSearchParams too', async () => {
    expect(await resolvePeriod(new URLSearchParams('year=2029&month=12'), undefined, { now })).toEqual({
      year: 2029,
      month: 12,
      source: 'url',
    })
  })
})

describe('period cookie', () => {
  it('round-trips a month and all months', () => {
    expect(formatPeriodCookie({ year: 2029, month: 3 })).toBe('2029-3')
    expect(formatPeriodCookie({ year: 2029 })).toBe('2029')
    expect(parsePeriodCookie('2029-3')).toEqual({ year: 2029, month: 3 })
    expect(parsePeriodCookie('2029')).toEqual({ year: 2029 })
  })

  it('rejects junk', () => {
    expect(parsePeriodCookie('2029-13')).toBeNull()
    expect(parsePeriodCookie('29-3')).toBeNull()
    expect(parsePeriodCookie('')).toBeNull()
    expect(parsePeriodCookie(undefined)).toBeNull()
  })
})

describe('periodFromParams', () => {
  it('is null without a period', () => {
    expect(periodFromParams({ search: 'x' } as never)).toBeNull()
    expect(periodFromParams(null)).toBeNull()
  })
})

describe('isPeriodPath', () => {
  it('the overview, banks and cards pages', () => {
    for (const p of ['/', '/banks', '/banks/a1', '/cards', '/cards/c1', '/cards/categories', '/cards/c1/categories']) {
      expect(isPeriodPath(p)).toBe(true)
    }
  })

  it('not the pages without a period', () => {
    for (const p of ['/settings', '/about', '/upload', '/recurring', '/categories', '/search', '/cardsx']) {
      expect(isPeriodPath(p)).toBe(false)
    }
  })
})

describe('withPeriod', () => {
  it('adds the period to a period page link', () => {
    expect(withPeriod('/banks', { year: 2029, month: 3 })).toBe('/banks?year=2029&month=3')
    expect(withPeriod('/', { year: 2029 })).toBe('/?year=2029')
  })

  it('keeps other params and the hash', () => {
    expect(withPeriod('/cards/c1?category=Food#list', { year: 2029, month: 3 })).toBe(
      '/cards/c1?year=2029&month=3&category=Food#list'
    )
  })

  it('leaves a link that names a period alone', () => {
    expect(withPeriod('/cards/c1?year=2027&month=1', { year: 2029, month: 3 })).toBe('/cards/c1?year=2027&month=1')
  })

  it('leaves pages without a period alone', () => {
    expect(withPeriod('/settings#accounts', { year: 2029, month: 3 })).toBe('/settings#accounts')
    expect(withPeriod('/upload', { year: 2029 })).toBe('/upload')
  })
})

describe('stepPeriod', () => {
  it('moves one month within the year', () => {
    expect(stepPeriod({ year: 2026, month: 10 }, 1)).toEqual({ year: 2026, month: 11 })
    expect(stepPeriod({ year: 2026, month: 10 }, -1)).toEqual({ year: 2026, month: 9 })
  })

  it('crosses into the next and previous year', () => {
    expect(stepPeriod({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 })
    expect(stepPeriod({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  })

  it('steps a whole year when all months are shown', () => {
    expect(stepPeriod({ year: 2026 }, 1)).toEqual({ year: 2027 })
    expect(stepPeriod({ year: 2026 }, -1)).toEqual({ year: 2025 })
  })
})
