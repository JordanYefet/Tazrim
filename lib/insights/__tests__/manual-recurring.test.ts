import { describe, expect, it } from 'vitest'
import { detectRecurring, type RecurringTransaction } from '../recurring'
import {
  assignManual,
  descriptionMatches,
  inAmountRange,
  inDayWindow,
  normalizePattern,
  priceLevels,
  resolveManualSeries,
  rangeAround,
  validAmountRange,
  validDayWindow,
  type ManualSeriesDef,
} from '../manual-recurring'
import { applyOverrides, asApplied, recurringTransactionIds, summarizeRecurring } from '../recurring-overrides'

// Every value here is made up.

const BANK = 'acct_fake_bank'

const tx = (id: string, date: string, amount: number, description: string, over: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
  id,
  date,
  amount,
  description,
  originalDescription: description,
  source: 'bank',
  accountId: BANK,
  ...over,
})

const pad = (n: number) => String(n).padStart(2, '0')

/** A monthly cheque on the 3rd: ₪2,000 Jan-Jun 2030, ₪4,000 Jul-Oct, a new cheque number every month */
const cheques = (digits = 3) =>
  Array.from({ length: 10 }, (_, i) =>
    tx(`chq${i + 1}`, `2030-${pad(i + 1)}-03`, i < 6 ? 2000 : 4000, `שיק ${String(700 + i).padStart(digits, '9')}`)
  )

const def = (over: Partial<ManualSeriesDef> = {}): ManualSeriesDef => ({
  id: 'm1',
  accountId: BANK,
  source: 'bank',
  name: 'גן ילדים',
  cadence: 'monthly',
  pattern: 'שיק',
  dayFrom: null,
  dayTo: null,
  amountMin: null,
  amountMax: null,
  attachedIds: [],
  detachedIds: [],
  ...over,
})

describe('normalizePattern', () => {
  it('ignores cheque numbers and references, keeps the words', () => {
    expect(normalizePattern('שיק 704')).toBe('שיק')
    expect(normalizePattern('  שיק   0099123 ')).toBe('שיק')
    expect(normalizePattern('STREAMLY P1A2B3C4D')).toBe('streamly')
    expect(normalizePattern('הוראת קבע - ועד בית')).toBe('הוראת קבע ועד בית')
  })

  it('falls back to the letters when every word holds a digit', () => {
    expect(normalizePattern('A1B2')).toBe('a b')
  })

  it('matches whole words only', () => {
    expect(descriptionMatches('שיק 812', 'שיק')).toBe(true)
    expect(descriptionMatches('שיקום הבית', 'שיק')).toBe(false)
    expect(descriptionMatches('anything', '')).toBe(false)
  })
})

describe('day windows', () => {
  it('is inclusive and may wrap across the month end', () => {
    expect(inDayWindow(3, 1, 6)).toBe(true)
    expect(inDayWindow(7, 1, 6)).toBe(false)
    expect(inDayWindow(30, 28, 3)).toBe(true)
    expect(inDayWindow(2, 28, 3)).toBe(true)
    expect(inDayWindow(15, 28, 3)).toBe(false)
    expect(inDayWindow(15, null, null)).toBe(true)
  })

  it('validates both ends or neither', () => {
    expect(validDayWindow(null, null)).toBe(true)
    expect(validDayWindow(1, 31)).toBe(true)
    expect(validDayWindow(1, null)).toBe(false)
    expect(validDayWindow(0, 5)).toBe(false)
    expect(validDayWindow(2.5, 5)).toBe(false)
  })
})

describe('the cheque whose amount doubles', () => {
  it('stays one series, with the doubling shown as a price change', () => {
    const { series } = resolveManualSeries([def()], cheques(), { today: '2030-10-20' })
    expect(series).toHaveLength(1)
    const s = series[0]
    expect(s.occurrences).toBe(10)
    expect(s.latestAmount).toBe(4000)
    expect(s.monthlyAmount).toBe(4000)
    expect(s.priceIncrease).toEqual({ from: 2000, to: 4000, since: '2030-07-03' })
    expect(s.active).toBe(true)
    expect(s.nextDate).toBe('2030-11-03')
    expect(s.key).toBe('manual|m1')
    expect(s.manual).toEqual({ id: 'm1', pattern: 'שיק', dayFrom: null, dayTo: null, amountMin: null, amountMax: null, attachedIds: [], detachedIds: [] })
  })

  it('the detector alone misses it (3-digit cheque numbers make every month a different merchant)', () => {
    expect(detectRecurring(cheques(), { today: '2030-10-20' })).toEqual([])
  })

  it('with long cheque numbers the detector splits it in two; the manual series takes both', () => {
    const rows = cheques(7)
    const detected = detectRecurring(rows, { today: '2030-10-20' })
    expect(detected.map(s => s.latestAmount).sort()).toEqual([2000, 4000])

    const { series, claimed } = resolveManualSeries([def()], rows, { today: '2030-10-20' })
    expect(series[0].occurrences).toBe(10)
    expect(detectRecurring(rows, { today: '2030-10-20', exclude: claimed })).toEqual([])
  })

  it('a day window keeps an unrelated cheque out', () => {
    const rows = [...cheques(), tx('other', '2030-05-20', 750, 'שיק 991')]
    expect(resolveManualSeries([def()], rows).series[0].occurrences).toBe(11)
    expect(resolveManualSeries([def({ dayFrom: 1, dayTo: 6 })], rows).series[0].occurrences).toBe(10)
  })

  it('a single odd amount is not a price level', () => {
    const rows = cheques().slice(0, 6)
    rows[3] = { ...rows[3], amount: 2600 }
    expect(priceLevels(rows.map((r, i) => ({ day: i * 30, amount: r.amount }))).priceIncrease).toBeNull()
  })

  it('an unrelated cheque in the middle does not hide the doubling', () => {
    const rows = [...cheques(), tx('other', '2030-05-20', 1250, 'שיק 991')]
    const s = resolveManualSeries([def()], rows).series[0]
    expect(s.priceIncrease).toEqual({ from: 2000, to: 4000, since: '2030-07-03' })
  })

  it('the latest charge alone is enough to show a new level', () => {
    const rows = cheques().slice(0, 7)
    expect(resolveManualSeries([def()], rows).series[0].priceIncrease).toEqual({ from: 2000, to: 4000, since: '2030-07-03' })
  })
})

describe('amount range', () => {
  // the kindergarten cheque (₪2,000 then ₪4,000 on the 3rd) and other monthly cheques of
  // ₪1,250 on the 18th, all described "שיק" with a new number each time
  const others = Array.from({ length: 10 }, (_, i) => tx(`oth${i + 1}`, `2030-${pad(i + 1)}-18`, 1250, `שיק ${900 + i}`))
  const rows = [...cheques(), ...others]

  it('is inclusive and either end may be open', () => {
    expect(inAmountRange(2000, 2000, 4000)).toBe(true)
    expect(inAmountRange(4000.004, 2000, 4000)).toBe(true)
    expect(inAmountRange(1999, 2000, null)).toBe(false)
    expect(inAmountRange(9999, null, 5000)).toBe(false)
    expect(inAmountRange(1, null, null)).toBe(true)
    expect(validAmountRange(null, 10)).toBe(true)
    expect(validAmountRange(10, 5)).toBe(false)
    expect(validAmountRange(-1, null)).toBe(false)
    expect(validAmountRange('10', null)).toBe(false)
    expect(rangeAround(4000, 50)).toEqual({ amountMin: 2000, amountMax: 6000 })
  })

  it('keeps two cheque series with the same description apart', () => {
    const kinder = def({ id: 'kinder', name: 'גן ילדים', amountMin: 1800, amountMax: 4500 })
    const other = def({ id: 'other', name: 'שיקים אחרים', amountMin: 1000, amountMax: 1500 })
    const { series, claimed } = resolveManualSeries([kinder, other], rows, { today: '2030-10-20' })
    const [k, o] = series
    expect(k.transactionIds).toEqual(cheques().map(c => c.id))
    expect(k.priceIncrease).toEqual({ from: 2000, to: 4000, since: '2030-07-03' })
    expect(o.transactionIds).toEqual(others.map(c => c.id))
    expect(o.latestAmount).toBe(1250)
    expect(o.priceIncrease).toBeNull()
    expect(claimed.size).toBe(20)
    expect(summarizeRecurring(series.map(asApplied)).total).toBe(5250)
  })

  it('without a range the first series takes every cheque', () => {
    const got = assignManual([def({ id: 'a' }), def({ id: 'b' })], rows)
    expect(got.get('a')).toHaveLength(20)
    expect(got.get('b')).toHaveLength(0)
  })

  it('a range too narrow for the price change splits it; a wide one keeps one series', () => {
    const narrow = resolveManualSeries([def({ amountMin: 1800, amountMax: 2200 })], rows).series[0]
    expect(narrow.occurrences).toBe(6)
    const wide = resolveManualSeries([def(rangeAround(4000, 50))], rows).series[0]
    expect(wide.occurrences).toBe(10)
    expect(wide.manual).toMatchObject({ amountMin: 2000, amountMax: 6000 })
  })

  it('hand-attached rows ignore the range', () => {
    const s = resolveManualSeries([def({ amountMin: 1800, amountMax: 4500, attachedIds: ['oth1'] })], rows).series[0]
    expect(s.transactionIds).toContain('oth1')
    expect(s.occurrences).toBe(11)
  })
})

describe('attach and detach', () => {
  it('detached rows leave the series even though the rule matches', () => {
    const s = resolveManualSeries([def({ detachedIds: ['chq10'] })], cheques()).series[0]
    expect(s.occurrences).toBe(9)
    expect(s.transactionIds).not.toContain('chq10')
  })

  it('attached rows join without matching the rule; credits and other accounts never do', () => {
    const rows = [
      ...cheques(),
      tx('cash', '2030-11-03', 4000, 'משיכת מזומן'),
      tx('refund', '2030-11-04', 0, 'החזר'),
      tx('elsewhere', '2030-11-05', 4000, 'שיק 801', { accountId: 'acct_fake_other' }),
    ]
    const s = resolveManualSeries([def({ attachedIds: ['cash', 'refund', 'elsewhere'] })], rows).series[0]
    expect(s.occurrences).toBe(11)
    expect(s.transactionIds).toContain('cash')
    expect(s.lastDate).toBe('2030-11-03')
  })

  it('a series of attached rows only (no rule)', () => {
    const s = resolveManualSeries([def({ pattern: '', attachedIds: ['chq1', 'chq2'] })], cheques()).series[0]
    expect(s.transactionIds).toEqual(['chq1', 'chq2'])
  })

  it('a series with nothing left is kept, inactive, so it can be edited or removed', () => {
    const s = resolveManualSeries([def({ pattern: 'nothing here' })], cheques()).series[0]
    expect(s).toMatchObject({ occurrences: 0, active: false, lastDate: '', monthlyAmount: 0 })
  })
})

describe('no transaction in two series', () => {
  it('between manual series: hand attachments first, then the older rule', () => {
    const older = def({ id: 'a', pattern: 'שיק' })
    const newer = def({ id: 'b', pattern: 'שיק', attachedIds: ['chq5'] })
    const got = assignManual([older, newer], cheques())
    expect(got.get('b')!.map(t => t.id)).toEqual(['chq5'])
    expect(got.get('a')!).toHaveLength(9)
  })

  it('between manual and detected series: the manual series wins and the total counts it once', () => {
    const subs = Array.from({ length: 6 }, (_, i) => tx(`str${i}`, `2030-${pad(i + 5)}-07`, 45, 'STREAMLY P1A2B3C4D'))
    const rows = [...cheques(), ...subs]
    expect(detectRecurring(rows, { today: '2030-10-20' }).map(s => s.name)).toEqual(['STREAMLY'])
    const manual = resolveManualSeries([def({ id: 'stream', name: 'Streamly', pattern: 'streamly' })], rows, { today: '2030-10-20' })
    const detected = detectRecurring(rows, { today: '2030-10-20', exclude: manual.claimed })
    expect(detected).toEqual([])

    const all = [...applyOverrides(detected, []), ...manual.series.map(asApplied)]
    const summary = summarizeRecurring(all)
    expect(summary.subscriptions.map(s => s.name)).toEqual(['Streamly'])
    expect(summary.total).toBe(45)
    const ids = [...recurringTransactionIds(all)]
    expect(ids).toHaveLength(new Set(ids).size)
  })
})

describe('totals and cadences', () => {
  it('counts active manual series in the monthly total, per cadence', () => {
    const rows = cheques()
    const monthly = resolveManualSeries([def()], rows, { today: '2030-10-20' }).series
    const bimonthly = resolveManualSeries([def({ id: 'm2', cadence: 'bimonthly' })], rows, { today: '2030-10-20' }).series
    const yearly = resolveManualSeries([def({ id: 'm3', cadence: 'yearly' })], rows, { today: '2030-10-20' }).series
    expect(summarizeRecurring(monthly.map(asApplied)).total).toBe(4000)
    expect(bimonthly[0].monthlyAmount).toBe(2000)
    expect(bimonthly[0].nextDate).toBe('2030-12-03')
    expect(yearly[0].monthlyAmount).toBe(333.33)
  })

  it('a stopped manual series is listed as inactive and left out of the total', () => {
    const s = resolveManualSeries([def()], cheques(), { today: '2031-03-01' }).series.map(asApplied)
    const summary = summarizeRecurring(s)
    expect(summary.inactive).toHaveLength(1)
    expect(summary.total).toBe(0)
  })
})
