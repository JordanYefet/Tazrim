import { describe, expect, it } from 'vitest'
import {
  AMOUNT_EPSILON,
  buildBankWhere,
  buildCardWhere,
  compareResults,
  decodeCursor,
  encodeCursor,
  hasCriteria,
  highlightParts,
  parseAmount,
  parseAmountRange,
  parseSearchParams,
  splitTerms,
  textAsAmount,
  toSearchParams,
  transactionHref,
  type SearchResult,
} from '../query'

// Made-up merchants and amounts only.

describe('parseAmount', () => {
  it.each([
    ['120', 120],
    ['120.5', 120.5],
    ['₪120', 120],
    ['120₪', 120],
    ['120 ש"ח', 120],
    ['1,200', 1200],
    ['₪ 1,200.75', 1200.75],
    ['12,345,678', 12345678],
    ['  42 ', 42],
    ['-80', 80],
    ['0.99', 0.99],
  ])('%s -> %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it.each(['', 'abc', '12a', '1,20', '1.2.3', '₪', ',', '1,2345', '120,5'])('rejects %j', input => {
    expect(parseAmount(input)).toBeNull()
  })
})

describe('parseAmountRange', () => {
  it('exact amounts match within ±0.005', () => {
    const r = parseAmountRange('120')!
    expect(r.min).toBeCloseTo(120 - AMOUNT_EPSILON, 10)
    expect(r.max).toBeCloseTo(120 + AMOUNT_EPSILON, 10)
  })

  it('reads a range, in either order and with symbols', () => {
    expect(parseAmountRange('100-200')).toEqual({ min: 100, max: 200 })
    expect(parseAmountRange('₪200 – ₪100')).toEqual({ min: 100, max: 200 })
    expect(parseAmountRange('1,000-2,500.5')).toEqual({ min: 1000, max: 2500.5 })
  })

  it('reads open ranges', () => {
    expect(parseAmountRange('100-')).toEqual({ min: 100 })
    expect(parseAmountRange('>100')).toEqual({ min: 100 })
    expect(parseAmountRange('<50')).toEqual({ max: 50 })
  })

  it('rejects junk', () => {
    expect(parseAmountRange('')).toBeNull()
    expect(parseAmountRange('a-b')).toBeNull()
    expect(parseAmountRange('-')).toBeNull()
  })
})

describe('splitTerms / textAsAmount', () => {
  it('splits on whitespace, drops duplicates and blanks', () => {
    expect(splitTerms('  Fake  Cafe fake ')).toEqual(['Fake', 'Cafe'])
    expect(splitTerms('')).toEqual([])
    expect(splitTerms('100% a_b _')).toEqual(['100', 'a', 'b'])
  })

  it('treats a lone amount-like query as an amount too', () => {
    expect(textAsAmount('₪120')).toEqual(parseAmountRange('120'))
    expect(textAsAmount('1,200')).toEqual(parseAmountRange('1200'))
    expect(textAsAmount('Fake 120')).toBeNull()
    expect(textAsAmount('Cafe')).toBeNull()
  })
})

describe('parseSearchParams / toSearchParams', () => {
  it('reads every filter', () => {
    const sp = new URLSearchParams(
      'q=Fake+Cafe&amount=100-200&from=2030-01-01&to=2030-12-31&account=a1&account=a2&category=Food&ignored=1&limit=10'
    )
    const f = parseSearchParams(sp)
    expect(f).toMatchObject({
      text: 'Fake Cafe',
      amount: { min: 100, max: 200 },
      amountInput: '100-200',
      from: '2030-01-01',
      to: '2030-12-31',
      accountIds: ['a1', 'a2'],
      categories: ['Food'],
      includeIgnored: true,
      limit: 10,
    })
  })

  it('defaults: ignored off, limit 30, capped at 100, bad dates dropped', () => {
    const f = parseSearchParams({ q: 'x', limit: '5000', from: 'nope', to: '2030-02-30' })
    expect(f.includeIgnored).toBe(false)
    expect(f.limit).toBe(100)
    expect(f.from).toBeUndefined()
    expect(f.to).toBeUndefined()
    expect(parseSearchParams({}).limit).toBe(30)
  })

  it('min/max params build a range; a bad amount is kept as input but not applied', () => {
    expect(parseSearchParams({ min: '₪50', max: '1,000' }).amount).toEqual({ min: 50, max: 1000 })
    const bad = parseSearchParams({ amount: 'lots' })
    expect(bad.amount).toBeUndefined()
    expect(bad.amountInput).toBe('lots')
    expect(bad.amountInvalid).toBe(true)
  })

  it('round-trips through toSearchParams', () => {
    const sp = 'q=Fake&amount=120&account=a1&category=Food&ignored=1'
    const back = toSearchParams(parseSearchParams(new URLSearchParams(sp)))
    expect(parseSearchParams(back)).toEqual(parseSearchParams(new URLSearchParams(sp)))
    expect(back.get('limit')).toBeNull()
  })

  it('hasCriteria ignores the ignored toggle alone', () => {
    expect(hasCriteria(parseSearchParams({ ignored: '1' }))).toBe(false)
    expect(hasCriteria(parseSearchParams({ q: ' ' }))).toBe(false)
    expect(hasCriteria(parseSearchParams({ q: 'a' }))).toBe(true)
    expect(hasCriteria(parseSearchParams({ amount: '5' }))).toBe(true)
    expect(hasCriteria(parseSearchParams({ from: '2030-01-01' }))).toBe(true)
    expect(hasCriteria(parseSearchParams({ category: 'Food' }))).toBe(true)
  })
})

describe('cursor', () => {
  it('round-trips and rejects junk', () => {
    const c = { dateMs: 1900000000000, source: 'card' as const, id: 'abc-123' }
    expect(decodeCursor(encodeCursor(c))).toEqual(c)
    expect(decodeCursor('junk')).toBeNull()
    expect(decodeCursor('12.other.id')).toBeNull()
    expect(decodeCursor('x.bank.id')).toBeNull()
  })
})

describe('buildBankWhere', () => {
  const base = parseSearchParams({})

  it('excludes ignored rows by default', () => {
    expect(buildBankWhere(base)).toEqual({ AND: [{ ignored: false }] })
    expect(buildBankWhere({ ...base, includeIgnored: true })).toEqual({ AND: [] })
  })

  it('matches every term against description, original, note and alias', () => {
    const f = parseSearchParams({ q: 'Fake Cafe' })
    const where = buildBankWhere(f, [[{ provider: 'p1', originalName: 'RAW CAFE' }], []])!
    expect(where.AND).toContainEqual({
      OR: [
        { description: { contains: 'Fake' } },
        { originalDescription: { contains: 'Fake' } },
        { note: { contains: 'Fake' } },
        { originalDescription: { in: ['RAW CAFE'] }, account: { provider: 'p1' } },
      ],
    })
    expect(where.AND).toContainEqual({
      OR: [
        { description: { contains: 'Cafe' } },
        { originalDescription: { contains: 'Cafe' } },
        { note: { contains: 'Cafe' } },
      ],
    })
  })

  it('matches an amount on either side, ignoring zero sides', () => {
    const f = parseSearchParams({ amount: '100-200' })
    expect(buildBankWhere(f)!.AND).toContainEqual({
      OR: [
        { debit: { gt: 0, gte: 100, lte: 200 } },
        { credit: { gt: 0, gte: 100, lte: 200 } },
      ],
    })
  })

  it('a lone number in the text box matches text OR amount', () => {
    const f = parseSearchParams({ q: '120' })
    const and = buildBankWhere(f)!.AND as unknown[]
    const block = and.find(c => (c as { OR?: unknown[] }).OR?.length === 2) as { OR: unknown[] }
    expect(block.OR[0]).toEqual({
      AND: [{ OR: [{ description: { contains: '120' } }, { originalDescription: { contains: '120' } }, { note: { contains: '120' } }] }],
    })
    expect(JSON.stringify(block.OR[1])).toContain('debit')
  })

  it('date range is inclusive, local days', () => {
    const f = parseSearchParams({ from: '2030-01-01', to: '2030-01-31' })
    expect(buildBankWhere(f)!.AND).toContainEqual({
      date: { gte: new Date(2030, 0, 1), lt: new Date(2030, 1, 1) },
    })
  })

  it('accounts filter', () => {
    const f = parseSearchParams({ account: ['a1', 'a2'] })
    expect(buildBankWhere(f)!.AND).toContainEqual({ accountId: { in: ['a1', 'a2'] } })
  })

  it('a category filter leaves bank rows out (they have no category)', () => {
    expect(buildBankWhere(parseSearchParams({ category: 'Food' }))).toBeNull()
  })

  it('cursor: same source continues by id, the other source by date', () => {
    const d = new Date(1900000000000)
    const bankCursor = { ...base, cursor: { dateMs: d.getTime(), source: 'bank' as const, id: 'b5' } }
    expect(buildBankWhere(bankCursor)!.AND).toContainEqual({
      OR: [{ date: { lt: d } }, { date: d, id: { lt: 'b5' } }],
    })
    // bank sorts before card on the same day, so after a card cursor only older bank rows remain
    const cardCursor = { ...base, cursor: { dateMs: d.getTime(), source: 'card' as const, id: 'c5' } }
    expect(buildBankWhere(cardCursor)!.AND).toContainEqual({ date: { lt: d } })
  })
})

describe('buildCardWhere', () => {
  const base = parseSearchParams({})

  it('text, alias, amount (refunds too) and category', () => {
    const f = parseSearchParams({ q: 'Fake', amount: '50', category: 'Food' })
    const where = buildCardWhere(f, [[{ provider: 'p2', originalName: 'RAW FAKE' }]])
    expect(where.AND).toContainEqual({ ignored: false })
    expect(where.AND).toContainEqual({
      OR: [
        { merchantName: { contains: 'Fake' } },
        { originalMerchantName: { contains: 'Fake' } },
        { notes: { contains: 'Fake' } },
        { originalMerchantName: { in: ['RAW FAKE'] }, account: { provider: 'p2' } },
      ],
    })
    const amount = (where.AND as { OR?: { chargedAmount?: { gte?: number; lte?: number } }[] }[]).find(
      c => c.OR?.[0]?.chargedAmount
    )!
    expect(amount.OR![0].chargedAmount!.gte).toBeCloseTo(49.995)
    expect(amount.OR![1].chargedAmount!.lte).toBeCloseTo(-49.995)
    expect(where.AND).toContainEqual({
      OR: [{ categoryOverride: { in: ['Food'] } }, { categoryOverride: null, category: { in: ['Food'] } }],
    })
  })

  it('cursor after a bank row keeps every card row of that day', () => {
    const d = new Date(1900000000000)
    const f = { ...base, cursor: { dateMs: d.getTime(), source: 'bank' as const, id: 'b5' } }
    expect(buildCardWhere(f).AND).toContainEqual({ transactionDate: { lte: d } })
  })
})

const result = (over: Partial<SearchResult>): SearchResult => ({
  id: 'x',
  source: 'bank',
  accountId: 'a',
  accountName: 'A',
  date: '2030-03-05',
  dateMs: new Date(2030, 2, 5).getTime(),
  description: 'Fake Shop',
  amount: 10,
  ignored: false,
  ...over,
})

describe('compareResults', () => {
  it('newest first, bank before card on the same moment, then id descending', () => {
    const rows = [
      result({ id: 'a', source: 'card', dateMs: 1 }),
      result({ id: 'b', source: 'bank', dateMs: 1 }),
      result({ id: 'c', source: 'bank', dateMs: 1 }),
      result({ id: 'd', source: 'card', dateMs: 2 }),
    ]
    expect(rows.sort(compareResults).map(r => r.id)).toEqual(['d', 'c', 'b', 'a'])
  })
})

describe('highlightParts', () => {
  it('marks every match, case-insensitively, keeping the original text', () => {
    expect(highlightParts('Fake CAFE fake', ['fake'])).toEqual([
      { text: 'Fake', match: true },
      { text: ' CAFE ', match: false },
      { text: 'fake', match: true },
    ])
  })

  it('handles Hebrew, overlapping terms and regex characters', () => {
    expect(highlightParts('קפה דמיוני', ['קפה'])).toEqual([
      { text: 'קפה', match: true },
      { text: ' דמיוני', match: false },
    ])
    expect(highlightParts('abcd', ['abc', 'bcd'])).toEqual([{ text: 'abcd', match: true }])
    expect(highlightParts('a.b (c)', ['(c)'])).toEqual([
      { text: 'a.b ', match: false },
      { text: '(c)', match: true },
    ])
    expect(highlightParts('plain', [])).toEqual([{ text: 'plain', match: false }])
  })
})

describe('transactionHref', () => {
  it('bank rows link to the bank table, card rows to the cards table', () => {
    expect(transactionHref(result({ description: 'Fake Shop & Co' }))).toBe(
      '/bank?year=2030&month=3&search=Fake+Shop+%26+Co'
    )
    expect(transactionHref(result({ source: 'card', description: 'קפה' }))).toBe(
      `/cards/max?year=2030&month=3&search=${encodeURIComponent('קפה')}`
    )
  })

  it('an ignored row links with ignored rows shown', () => {
    expect(transactionHref(result({ ignored: true }))).toContain('showIgnored=true')
  })
})
