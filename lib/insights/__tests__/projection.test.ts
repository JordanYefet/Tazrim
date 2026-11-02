import { describe, expect, it } from 'vitest'
import {
  addMonths,
  everydayFlows,
  monthKey,
  occurrences,
  projectBalance,
  projectedSeries,
  type BankFlowRow,
  type CardChargeRow,
  type ProjectionInput,
  type ProjectionSeries,
} from '../projection'

// Made-up rows only
const WINDOW = ['2030-01', '2030-02', '2030-03', '2030-04', '2030-05', '2030-06']
let n = 0
const bank = (date: string, over: Partial<BankFlowRow> = {}): BankFlowRow => ({
  id: `b${++n}`, date, debit: 0, credit: 0, category: null, isCardPayment: false, ...over,
})
const card = (billingDate: string, amount: number, id = `c${++n}`): CardChargeRow => ({ id, billingDate, amount })
const series = (over: Partial<ProjectionSeries> = {}): ProjectionSeries => ({
  key: `s${++n}`, name: 'Series', source: 'bank', cadence: 'monthly', latestAmount: 100, monthlyAmount: 100,
  nextDate: '2030-07-15', active: true, dismissed: false, isCardPayment: false, isInstallment: false,
  transactionIds: [], ...over,
})
const each = <T,>(f: (m: string) => T) => WINDOW.map(m => f(m))

describe('month helpers', () => {
  it('keys and steps months across years', () => {
    expect(monthKey('2030-03-15')).toBe('2030-03')
    expect(addMonths('2030-11', 3)).toBe('2031-02')
    expect(addMonths('2030-01', -1)).toBe('2029-12')
  })
})

describe('everydayFlows', () => {
  it('takes the per-category median, so one big month does not move it', () => {
    const rows = each(m => bank(`${m}-05`, { debit: m === '2030-03' ? 20000 : 3000, category: 'סופר' }))
    const e = everydayFlows(rows, [], [], WINDOW)
    expect(e.expense).toEqual({ סופר: 3000 })
  })

  it('splits income from spending', () => {
    const rows = [
      ...each(m => bank(`${m}-01`, { credit: 10000, category: 'משכורת' })),
      ...each(m => bank(`${m}-09`, { debit: 4000, category: 'שכירות' })),
    ]
    const e = everydayFlows(rows, [], [], WINDOW)
    expect(e.income).toEqual({ משכורת: 10000 })
    expect(e.expense).toEqual({ שכירות: 4000 })
    expect(e.sigma).toBe(0)
  })

  it('forecasts card spending from the bank card payments, even with no card files', () => {
    const rows = each(m => bank(`${m}-10`, { debit: 2000, isCardPayment: true }))
    const e = everydayFlows(rows, [], [], WINDOW)
    expect(e.card).toBe(2000)
    expect(e.expense).toEqual({})
  })

  it('takes recurring card charges out of the card payment, so they are not counted twice', () => {
    const subIds = WINDOW.map(() => `sub${++n}`)
    const rows = each(m => bank(`${m}-10`, { debit: 2000, isCardPayment: true }))
    const charges = WINDOW.map((m, i) => card(`${m}-02`, 100, subIds[i]))
    const sub = series({ source: 'card', transactionIds: subIds })
    expect(everydayFlows(rows, charges, [sub], WINDOW).card).toBe(1900)
  })

  it('leaves out rows of kept series, but counts rows of dismissed ones as everyday', () => {
    const kept = each(m => bank(`${m}-20`, { debit: 250, category: 'חשמל' }))
    const dismissed = each(m => bank(`${m}-21`, { debit: 80, category: 'קפה' }))
    const e = everydayFlows(
      [...kept, ...dismissed],
      [],
      [series({ transactionIds: kept.map(r => r.id) }), series({ dismissed: true, transactionIds: dismissed.map(r => r.id) })],
      WINDOW
    )
    expect(e.expense).toEqual({ קפה: 80 })
  })

  it('never treats a card-payment row as an ordinary recurring row', () => {
    const rows = each(m => bank(`${m}-10`, { debit: 2000, isCardPayment: true }))
    const cardPaymentSeries = series({ isCardPayment: true, transactionIds: rows.map(r => r.id) })
    expect(everydayFlows(rows, [], [cardPaymentSeries], WINDOW).card).toBe(2000)
  })

  it('measures how much the everyday net moves from month to month', () => {
    const rows = each(m => bank(`${m}-05`, { debit: m <= '2030-03' ? 1000 : 3000, category: 'סופר' }))
    // nets: -1000 ×3, -3000 ×3 → mean -2000, population σ 1000
    expect(everydayFlows(rows, [], [], WINDOW).sigma).toBe(1000)
  })

  it('names uncategorised rows', () => {
    const rows = each(m => bank(`${m}-05`, { debit: 50 }))
    expect(everydayFlows(rows, [], [], WINDOW).expense).toEqual({ 'ללא קטגוריה': 50 })
  })
})

describe('projectedSeries', () => {
  it('keeps active, kept, non-card-payment series only', () => {
    const keep = series()
    const out = projectedSeries([keep, series({ active: false }), series({ dismissed: true }), series({ isCardPayment: true })])
    expect(out).toEqual([keep])
  })
})

describe('occurrences', () => {
  it('lands a yearly item only in its own month', () => {
    expect(occurrences(series({ cadence: 'yearly', nextDate: '2030-09-15' }), '2030-07', '2031-07')).toEqual(['2030-09'])
  })

  it('repeats a monthly item every month of the range', () => {
    expect(occurrences(series({ nextDate: '2030-07-31' }), '2030-07', '2030-10')).toEqual(['2030-07', '2030-08', '2030-09', '2030-10'])
  })

  it('skips hits before the range', () => {
    expect(occurrences(series({ nextDate: '2030-05-03' }), '2030-07', '2030-08')).toEqual(['2030-07', '2030-08'])
  })

  it('moves a card subscription to the bank month after its charge, but not an instalment', () => {
    const sub = series({ source: 'card', cadence: 'yearly', nextDate: '2030-09-20' })
    expect(occurrences(sub, '2030-07', '2031-06')).toEqual(['2030-10'])
    const plan = series({ source: 'card', isInstallment: true, nextDate: '2030-09-02' })
    expect(occurrences(plan, '2030-09', '2030-10')).toEqual(['2030-09', '2030-10'])
  })

  it('counts every hit of a weekly item in its month', () => {
    const weekly = series({ cadence: 'weekly', nextDate: '2030-07-01' })
    expect(occurrences(weekly, '2030-07', '2030-07')).toEqual(['2030-07', '2030-07', '2030-07', '2030-07', '2030-07'])
  })
})

const salaryAndRent = () => [
  ...each(m => bank(`${m}-01`, { credit: 10000, category: 'משכורת' })),
  ...each(m => bank(`${m}-09`, { debit: 6000, category: 'שכירות' })),
]
const input = (over: Partial<ProjectionInput> = {}): ProjectionInput => ({
  today: '2030-07-05',
  cushion: 0,
  start: { balance: 5000, date: '2030-07-03' },
  bank: salaryAndRent(),
  cards: [],
  series: [],
  past: [],
  ...over,
})
const ok = (p: ReturnType<typeof projectBalance>) => {
  if (p.insufficient) throw new Error('expected a projection')
  return p
}

describe('projectBalance', () => {
  it('needs a starting balance', () => {
    expect(projectBalance(input({ start: null }))).toEqual({ insufficient: true, completeMonths: 0 })
  })

  it('needs 3 months of history', () => {
    const rows = ['2030-05', '2030-06'].map(m => bank(`${m}-01`, { credit: 100 }))
    expect(projectBalance(input({ bank: rows }))).toEqual({ insufficient: true, completeMonths: 2 })
  })

  it('projects the 12 months after the current one, adding each month\'s net', () => {
    const p = ok(projectBalance(input()))
    expect(p.months.map(m => m.month)).toEqual([
      '2030-08', '2030-09', '2030-10', '2030-11', '2030-12', '2031-01',
      '2031-02', '2031-03', '2031-04', '2031-05', '2031-06', '2031-07',
    ])
    expect(p.months[0]).toMatchObject({ income: 10000, expense: 6000, net: 4000, expected: 9000, stale: false })
    expect(p.end.expected).toBe(5000 + 12 * 4000)
  })

  it('puts a yearly payment in its own month and flags it when the low edge drops under the cushion', () => {
    const insurance = series({ name: 'ביטוח', cadence: 'yearly', latestAmount: 20000, monthlyAmount: 1666.67, nextDate: '2030-09-12' })
    const p = ok(projectBalance(input({ series: [insurance], cushion: 1000 })))
    const sep = p.months.find(m => m.month === '2030-09')!
    expect(sep.expense).toBe(26000)
    expect(sep.expected).toBe(5000 + 4000 - 16000)
    expect(sep.tight).toBe(true)
    expect(p.tight.map(m => m.month)).toEqual(['2030-09', '2030-10'])
    expect(p.months.filter(m => m.expense === 26000)).toHaveLength(1)
  })

  it('does not add the card-payment series on top of the card line', () => {
    const payments = each(m => bank(`${m}-10`, { debit: 2000, isCardPayment: true }))
    const cardPaymentSeries = series({ isCardPayment: true, latestAmount: 2000, transactionIds: payments.map(r => r.id) })
    const p = ok(projectBalance(input({ bank: [...salaryAndRent(), ...payments], series: [cardPaymentSeries] })))
    expect(p.months[0].expense).toBe(6000 + 2000)
  })

  it('widens the band with the horizon', () => {
    const rows = [...salaryAndRent(), ...each(m => bank(`${m}-15`, { debit: m <= '2030-03' ? 1000 : 3000, category: 'סופר' }))]
    const p = ok(projectBalance(input({ bank: rows })))
    expect(p.sigma).toBe(1000)
    expect(p.months[0].high - p.months[0].expected).toBe(1000)
    expect(p.months[3].high - p.months[3].expected).toBe(2000)
    expect(p.months[3].expected - p.months[3].low).toBe(2000)
  })

  it('projects the months since the last upload too, marked stale', () => {
    const p = ok(projectBalance(input({ today: '2030-09-10' })))
    expect(p.months[0]).toMatchObject({ month: '2030-08', stale: true })
    expect(p.months[1]).toMatchObject({ month: '2030-09', stale: true })
    expect(p.months[2]).toMatchObject({ month: '2030-10', stale: false })
    expect(p.months.at(-1)!.month).toBe('2031-09')
  })

  it('lists what went into the forecast', () => {
    const gym = series({ key: 'gym', name: 'חדר כושר', source: 'card', latestAmount: 150, monthlyAmount: 150 })
    const payments = each(m => bank(`${m}-10`, { debit: 900, isCardPayment: true }))
    const p = ok(projectBalance(input({ bank: [...salaryAndRent(), ...payments], series: [gym] })))
    expect(p.items).toEqual([
      { key: 'income:משכורת', name: 'משכורת', kind: 'everyday', direction: 'in', cadence: null, monthlyAmount: 10000, seriesKey: null },
      { key: 'expense:שכירות', name: 'שכירות', kind: 'everyday', direction: 'out', cadence: null, monthlyAmount: 6000, seriesKey: null },
      { key: 'card', name: 'כרטיסי אשראי', kind: 'card', direction: 'out', cadence: null, monthlyAmount: 900, seriesKey: null },
      { key: 'series:gym', name: 'חדר כושר', kind: 'recurring', direction: 'out', cadence: 'monthly', monthlyAmount: 150, seriesKey: 'gym' },
    ])
  })

  it('passes the cushion and the past balances through', () => {
    const past = [{ month: '2030-06', balance: 4800 }]
    const p = ok(projectBalance(input({ cushion: 2500, past })))
    expect(p.cushion).toBe(2500)
    expect(p.past).toEqual(past)
  })
})
