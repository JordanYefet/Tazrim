import { describe, expect, it } from 'vitest'
import {
  actualCategories,
  addMonths,
  everydayFlows,
  monthKey,
  hitsLeftInMonth,
  occurrences,
  projectBalance,
  projectedSeries,
  restOfMonth,
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

describe('the rest of the latest data month', () => {
  it('lists the hits still due after a day, within its month only', () => {
    expect(hitsLeftInMonth(series({ nextDate: '2030-06-20' }), '2030-06-15')).toEqual(['2030-06-20'])
    expect(hitsLeftInMonth(series({ nextDate: '2030-06-10' }), '2030-06-15')).toEqual([])
    expect(hitsLeftInMonth(series({ nextDate: '2030-06-15' }), '2030-06-15')).toEqual([])
    expect(hitsLeftInMonth(series({ cadence: 'weekly', nextDate: '2030-06-14' }), '2030-06-15')).toEqual(['2030-06-21', '2030-06-28'])
  })

  it('measures the share of the month still to come', () => {
    expect(restOfMonth('2030-06-15')).toBe(0.5)
    expect(restOfMonth('2030-06-30')).toBe(0)
    expect(restOfMonth('2030-02-07')).toBe(0.75)
  })
})

const salaryAndRent = (months = WINDOW) => [
  ...months.map(m => bank(`${m}-01`, { credit: 10000, category: 'משכורת' })),
  ...months.map(m => bank(`${m}-09`, { debit: 6000, category: 'שכירות' })),
]
// July's salary and rent are in too: the data ends on 2030-07-31, so July's own row has nothing left to come
const throughJuly = () => salaryAndRent([...WINDOW, '2030-07'])
const input = (over: Partial<ProjectionInput> = {}): ProjectionInput => ({
  today: '2030-07-31',
  cushion: 0,
  start: { balance: 5000, date: '2030-07-31' },
  bank: throughJuly(),
  cards: [],
  series: [],
  past: [],
  ...over,
})
// The data ends mid-June (30 days): half of June is still to come (fraction 0.5). June's salary
// (the 1st) and rent (the 9th) are already in. Window Dec 2029 – May 2030, of which Jan–May have data.
const midJune = (over: Partial<ProjectionInput> = {}) =>
  input({ today: '2030-06-20', start: { balance: 5000, date: '2030-06-15' }, bank: salaryAndRent(), ...over })
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

  it('starts with the rest of the latest data month, then the 12 months after the current one, adding each month\'s net', () => {
    const p = ok(projectBalance(input()))
    expect(p.months.map(m => m.month)).toEqual([
      '2030-07',
      '2030-08', '2030-09', '2030-10', '2030-11', '2030-12', '2031-01',
      '2031-02', '2031-03', '2031-04', '2031-05', '2031-06', '2031-07',
    ])
    expect(p.months[0]).toMatchObject({ income: 0, expense: 0, net: 0, expected: 5000, stale: true })
    expect(p.months[1]).toMatchObject({ income: 10000, expense: 6000, net: 4000, expected: 9000, stale: false })
    expect(p.end.expected).toBe(5000 + 12 * 4000)
  })

  it('adds no salary or rent to the latest data month when they are already in', () => {
    const p = ok(projectBalance(midJune()))
    expect(p.months).toHaveLength(13)
    expect(p.months[0]).toMatchObject({ month: '2030-06', income: 0, expense: 0, net: 0, expected: 5000, stale: true })
    expect(p.months[1]).toMatchObject({ month: '2030-07', income: 10000, expense: 6000, expected: 9000 })
  })

  it('adds the salary still to come when it has not landed yet this month', () => {
    const rows = [...salaryAndRent(WINDOW.slice(0, 5)), bank('2030-06-09', { debit: 6000, category: 'שכירות' })]
    const p = ok(projectBalance(midJune({ bank: rows })))
    expect(p.months[0]).toMatchObject({ income: 10000, expense: 0, expected: 15000 })
  })

  it('adds the rest of the usual everyday spending: half a month of supermarket seen', () => {
    const shop = [...each(m => bank(`${m}-05`, { debit: 3000, category: 'סופר' })).slice(0, 5), bank('2030-06-05', { debit: 1200, category: 'סופר' })]
    const p = ok(projectBalance(midJune({ bank: [...salaryAndRent(), ...shop] })))
    expect(p.months[0].expense).toBe(1800)
    expect(p.months[0].income).toBe(0)
  })

  it('adds no card spending to the latest data month when its card payment is already made', () => {
    const payments = each(m => bank(`${m}-10`, { debit: 2000, isCardPayment: true }))
    const p = ok(projectBalance(midJune({ bank: [...salaryAndRent(), ...payments] })))
    expect(p.months[0].expense).toBe(0)
    expect(p.months[1].expense).toBe(6000 + 2000)
  })

  it('adds the card payment still to come when it has not been made yet this month', () => {
    const payments = each(m => bank(`${m}-20`, { debit: 2000, isCardPayment: true })).slice(0, 5)
    const p = ok(projectBalance(midJune({ bank: [...salaryAndRent(), ...payments] })))
    expect(p.months[0].expense).toBe(2000)
  })

  it('counts a bank recurring hit in the latest data month only when it falls after the start date', () => {
    const due = series({ latestAmount: 100, nextDate: '2030-06-20' })
    const passed = series({ latestAmount: 700, nextDate: '2030-06-10' })
    const p = ok(projectBalance(midJune({ series: [due, passed] })))
    expect(p.months[0].expense).toBe(100)
    expect(p.months[1].expense).toBe(6000 + 100 + 700)
  })

  // A card subscription of 200 charged on the 20th, billed by the bank on the 2nd of the next month,
  // with the card paid from the bank on the 20th (2000 a month: 1800 everyday + the 200).
  // Its rows are in the data, as the detector sees them; nextDate is what it produces for `lastDate`.
  const subscription = (charged: string[], nextDate: string) => {
    const rows = charged.map(m => card(`${addMonths(m, 1)}-02`, 200))
    const sub = series({ source: 'card', latestAmount: 200, monthlyAmount: 200, nextDate, transactionIds: rows.map(r => r.id) })
    return { rows, sub }
  }
  const cardPayments = (months: string[]) => months.map(m => bank(`${m}-20`, { debit: 2000, isCardPayment: true }))

  it('counts the card recurring charges already in the data and billed this month in the card payment still to come', () => {
    // data ends 2030-06-15: May's charge (billed 06-02) is in, the June card payment (06-20) is not yet made
    const { rows, sub } = subscription(['2029-12', '2030-01', '2030-02', '2030-03', '2030-04', '2030-05'], '2030-06-20')
    const p = ok(projectBalance(midJune({ bank: [...salaryAndRent(), ...cardPayments(WINDOW.slice(0, 5))], cards: rows, series: [sub] })))
    expect(p.months[0].expense).toBe(1800 + 200)
    // July: the 06-20 charge, projected
    expect(p.months[1].expense).toBe(6000 + 1800 + 200)
    expect(p.months.slice(1).every(m => m.expense === 8000)).toBe(true)
    // with this month's card payment already made, nothing card-related is left
    const paid = ok(projectBalance(midJune({ bank: [...salaryAndRent(), ...cardPayments(WINDOW)], cards: rows, series: [sub] })))
    expect(paid.months[0].expense).toBe(0)
  })

  it('counts a card recurring charge already in the data in the month the bank pays it, the month after the data ends', () => {
    // data ends 2030-06-25: June's charge (06-20, billed 07-02) is in; nextDate is 07-20 (paid in August)
    const { rows, sub } = subscription(['2029-12', '2030-01', '2030-02', '2030-03', '2030-04', '2030-05', '2030-06'], '2030-07-20')
    const p = ok(projectBalance(input({
      today: '2030-06-25', start: { balance: 5000, date: '2030-06-25' },
      bank: [...salaryAndRent(), ...cardPayments(WINDOW)], cards: rows, series: [sub],
    })))
    expect(p.months[0].expense).toBe(0)
    expect(p.months[1]).toMatchObject({ month: '2030-07', expense: 6000 + 1800 + 200 })
    expect(p.months.slice(1).every(m => m.expense === 8000)).toBe(true)
  })

  it('leaves the rows of an ended series out of the everyday flows, and does not project it', () => {
    const rent = each(m => bank(`${m}-12`, { debit: 1500, category: 'שכירות ישנה' }))
    const ended = series({ active: false, latestAmount: 1500, transactionIds: rent.map(r => r.id) })
    const p = ok(projectBalance(input({ bank: [...throughJuly(), ...rent], series: [ended] })))
    expect(p.months[1].expense).toBe(6000)
    expect(p.items.map(i => i.key)).not.toContain(`series:${ended.key}`)
    expect(p.items.map(i => i.name)).not.toContain('שכירות ישנה')
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
    const p = ok(projectBalance(input({ bank: [...throughJuly(), ...payments], series: [cardPaymentSeries] })))
    expect(p.months[1].expense).toBe(6000 + 2000)
  })

  it('widens the band with the horizon', () => {
    const rows = [...throughJuly(), ...each(m => bank(`${m}-15`, { debit: m <= '2030-03' ? 1000 : 3000, category: 'סופר' }))]
    const p = ok(projectBalance(input({ bank: rows })))
    expect(p.sigma).toBe(1000)
    // nothing left of July: no spread yet; then σ·√n for the n-th month after it
    expect(p.months[0].high - p.months[0].expected).toBe(0)
    expect(p.months[1].high - p.months[1].expected).toBe(1000)
    expect(p.months[4].high - p.months[4].expected).toBe(2000)
    expect(p.months[4].expected - p.months[4].low).toBe(2000)
  })

  it('starts the band from the part of the month still to come', () => {
    // everyday nets over Jan–May: 3000 ×2, 1000 ×3 → population σ ≈ 979.8
    const rows = [...salaryAndRent(), ...each(m => bank(`${m}-15`, { debit: m <= '2030-02' ? 1000 : 3000, category: 'סופר' }))]
    const p = ok(projectBalance(midJune({ bank: rows })))
    const spread = (i: number) => Math.round((p.months[i].high - p.months[i].expected) * 100) / 100
    expect(spread(0)).toBe(Math.round(p.sigma * Math.sqrt(0.5) * 100) / 100)
    expect(spread(1)).toBe(Math.round(p.sigma * Math.sqrt(1.5) * 100) / 100)
    expect(spread(3)).toBe(Math.round(p.sigma * Math.sqrt(3.5) * 100) / 100)
    expect(spread(3)).toBeGreaterThan(spread(1))
  })

  it('projects the months since the last upload too, marked stale', () => {
    const p = ok(projectBalance(input({ today: '2030-09-10' })))
    expect(p.months[0]).toMatchObject({ month: '2030-07', stale: true })
    expect(p.months[1]).toMatchObject({ month: '2030-08', stale: true })
    expect(p.months[2]).toMatchObject({ month: '2030-09', stale: true })
    expect(p.months[3]).toMatchObject({ month: '2030-10', stale: false })
    expect(p.months.at(-1)!.month).toBe('2031-09')
  })

  it('lists what went into the forecast', () => {
    const gym = series({ key: 'gym', name: 'חדר כושר', source: 'card', latestAmount: 150, monthlyAmount: 150 })
    const payments = each(m => bank(`${m}-10`, { debit: 900, isCardPayment: true }))
    const p = ok(projectBalance(input({ bank: [...throughJuly(), ...payments], series: [gym] })))
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

describe('forecast by category', () => {
  it('adds everyday categories, recurring series by category, and card spending split by the card rows', () => {
    const payments = each(m => bank(`${m}-10`, { debit: 1000, isCardPayment: true }))
    const charges: CardChargeRow[] = [
      ...WINDOW.map(m => ({ id: `food${++n}`, billingDate: `${m}-10`, amount: 750, category: 'מזון' })),
      ...WINDOW.map(m => ({ id: `fun${++n}`, billingDate: `${m}-10`, amount: 250, category: 'פנאי' })),
    ]
    const gym = series({ name: 'חדר כושר', latestAmount: 150, monthlyAmount: 150, category: 'פנאי' })
    const insurance = series({ name: 'ביטוח', cadence: 'yearly', latestAmount: 1200, monthlyAmount: 100, nextDate: '2030-09-12', category: null })
    const p = ok(projectBalance(input({ bank: [...salaryAndRent(), ...payments], cards: charges, series: [gym, insurance] })))
    expect(p.categories).toEqual([
      { name: 'שכירות', monthlyAmount: 6000 },
      { name: 'מזון', monthlyAmount: 750 },
      { name: 'פנאי', monthlyAmount: 250 + 150 },
      { name: 'ללא קטגוריה', monthlyAmount: 100 },
    ])
  })

  it('keeps card spending under the cards when there are no card rows', () => {
    const payments = each(m => bank(`${m}-10`, { debit: 900, isCardPayment: true }))
    const p = ok(projectBalance(input({ bank: [...salaryAndRent(), ...payments] })))
    expect(p.categories).toContainEqual({ name: 'כרטיסי אשראי', monthlyAmount: 900 })
  })
})

describe('the averaging window', () => {
  it('uses up to 24 complete months, not just the last 6', () => {
    // 12 months at 1000, then 6 recent months at 3000: the median over all 18 is 1000
    const months18 = Array.from({ length: 18 }, (_, i) => addMonths('2029-01', i))
    const rows = months18.map((m, i) => bank(`${m}-05`, { debit: i < 12 ? 1000 : 3000, category: 'סופר' }))
    const salary = months18.map(m => bank(`${m}-01`, { credit: 10000, category: 'משכורת' }))
    const p = ok(projectBalance(input({ today: '2030-07-05', start: { balance: 5000, date: '2030-07-03' }, bank: [...rows, ...salary] })))
    expect(p.categories).toContainEqual({ name: 'סופר', monthlyAmount: 1000 })
  })

  it('ignores months older than 24 complete months', () => {
    const old = Array.from({ length: 12 }, (_, i) => bank(`${addMonths('2027-01', i)}-05`, { debit: 9000, category: 'סופר' }))
    const recent = Array.from({ length: 24 }, (_, i) => addMonths('2028-07', i))
    const rows = recent.map(m => bank(`${m}-05`, { debit: 2000, category: 'סופר' }))
    const p = ok(projectBalance(input({ today: '2030-07-05', start: { balance: 5000, date: '2030-07-03' }, bank: [...old, ...rows] })))
    expect(p.categories).toContainEqual({ name: 'סופר', monthlyAmount: 2000 })
  })
})

describe('seasonality', () => {
  // The 24 complete months before July 2030, each with salary and rent
  const months24 = Array.from({ length: 24 }, (_, i) => addMonths('2028-07', i))
  const steady = () => [
    ...months24.map(m => bank(`${m}-01`, { credit: 10000, category: 'משכורת' })),
    ...months24.map(m => bank(`${m}-09`, { debit: 6000, category: 'שכירות' })),
  ]
  const at = (p: Extract<ReturnType<typeof projectBalance>, { insufficient: false }>, month: string) => p.months.find(m => m.month === month)!

  it('puts a spending peak that came in the same month two years running back in that month', () => {
    const camp = ['2028-08', '2029-08'].map(m => bank(`${m}-15`, { debit: 3000, category: 'קייטנה' }))
    const p = ok(projectBalance(input({ bank: [...steady(), ...camp] })))
    expect(at(p, '2030-08').expense).toBe(6000 + 3000)
    expect(at(p, '2030-09').expense).toBe(6000)
  })

  it('counts a peak seen in only one year at half its size', () => {
    const camp = bank('2029-08-15', { debit: 3000, category: 'קייטנה' })
    const rows = [...steady().filter(r => r.date >= '2029-07'), camp]
    const p = ok(projectBalance(input({ bank: rows })))
    expect(at(p, '2030-08').expense).toBe(6000 + 1500)
  })

  it('moves income too: a yearly bonus month', () => {
    const bonus = ['2028-12', '2029-12'].map(m => bank(`${m}-20`, { credit: 8000, category: 'בונוס' }))
    const p = ok(projectBalance(input({ bank: [...steady(), ...bonus] })))
    expect(at(p, '2030-12').income).toBe(10000 + 8000)
    expect(at(p, '2030-11').income).toBe(10000)
  })

  it('narrows the band when the months follow their season', () => {
    const camp = ['2028-08', '2029-08'].map(m => bank(`${m}-15`, { debit: 3000, category: 'קייטנה' }))
    const p = ok(projectBalance(input({ bank: [...steady(), ...camp] })))
    expect(p.sigma).toBe(0)
  })

  it('stays with the typical month under a year of history', () => {
    const rows = [...steady().filter(r => r.date >= '2029-09'), bank('2030-02-15', { debit: 3000, category: 'קייטנה' })]
    const p = ok(projectBalance(input({ bank: rows })))
    expect(at(p, '2031-02').expense).toBe(6000)
  })
})

describe('each month by category', () => {
  it('puts a yearly charge in its own month, under its category, and adds up to the month', () => {
    const insurance = series({ name: 'ביטוח', cadence: 'yearly', latestAmount: 2000, monthlyAmount: 166.67, nextDate: '2030-09-12', category: 'ביטוח' })
    const payments = each(m => bank(`${m}-10`, { debit: 1000, isCardPayment: true }))
    const charges: CardChargeRow[] = WINDOW.map(m => ({ id: `food${++n}`, billingDate: `${m}-10`, amount: 1000, category: 'מזון' }))
    const p = ok(projectBalance(input({ bank: [...salaryAndRent(), ...payments], cards: charges, series: [insurance] })))
    const sep = p.months.find(m => m.month === '2030-09')!
    const oct = p.months.find(m => m.month === '2030-10')!
    expect(sep.categories).toEqual([
      { name: 'שכירות', monthlyAmount: 6000 },
      { name: 'ביטוח', monthlyAmount: 2000 },
      { name: 'מזון', monthlyAmount: 1000 },
    ])
    expect(oct.categories!.map(c => c.name)).not.toContain('ביטוח')
    for (const m of p.months) expect(m.categories!.reduce((a, c) => a + c.monthlyAmount, 0)).toBeCloseTo(m.expense, 1)
  })

  it('follows the season: a peak month shows its category', () => {
    const months24 = Array.from({ length: 24 }, (_, i) => addMonths('2028-07', i))
    const rows = [
      ...months24.map(m => bank(`${m}-01`, { credit: 10000, category: 'משכורת' })),
      ...months24.map(m => bank(`${m}-09`, { debit: 6000, category: 'שכירות' })),
      ...['2028-08', '2029-08'].map(m => bank(`${m}-15`, { debit: 3000, category: 'קייטנה' })),
    ]
    const p = ok(projectBalance(input({ bank: rows })))
    expect(p.months.find(m => m.month === '2030-08')!.categories).toContainEqual({ name: 'קייטנה', monthlyAmount: 3000 })
    expect(p.months.find(m => m.month === '2030-09')!.categories!.map(c => c.name)).not.toContain('קייטנה')
  })
})

describe('card spending by category, by season', () => {
  it('splits a month’s card spending like the same month in past years', () => {
    const months24 = Array.from({ length: 24 }, (_, i) => addMonths('2028-07', i))
    const base = [
      ...months24.map(m => bank(`${m}-01`, { credit: 10000, category: 'משכורת' })),
      ...months24.map(m => bank(`${m}-10`, { debit: m.endsWith('-09') ? 4000 : 1000, isCardPayment: true })),
    ]
    const charges: CardChargeRow[] = months24.flatMap(m =>
      m.endsWith('-09')
        ? [{ id: `food${++n}`, billingDate: `${m}-10`, amount: 1000, category: 'מזון' }, { id: `trip${++n}`, billingDate: `${m}-10`, amount: 3000, category: 'תיירות' }]
        : [{ id: `food${++n}`, billingDate: `${m}-10`, amount: 1000, category: 'מזון' }]
    )
    const p = ok(projectBalance(input({ bank: base, cards: charges })))
    const sep = p.months.find(m => m.month === '2030-09')!
    expect(sep.categories).toEqual([
      { name: 'תיירות', monthlyAmount: 3000 },
      { name: 'מזון', monthlyAmount: 1000 },
    ])
    expect(p.months.find(m => m.month === '2030-10')!.categories).toEqual([{ name: 'מזון', monthlyAmount: 1000 }])
  })
})

describe('actual spending by category', () => {
  it('takes bank debits by category and splits the card payment by the card rows billed that month', () => {
    const rows = [
      bank('2030-05-09', { debit: 6000, category: 'שכירות' }),
      bank('2030-05-10', { debit: 1000, isCardPayment: true }),
      bank('2030-05-01', { credit: 10000, category: 'משכורת' }),
    ]
    const charges: CardChargeRow[] = [
      { id: 'f1', billingDate: '2030-05-10', amount: 750, category: 'מזון' },
      { id: 'f2', billingDate: '2030-05-10', amount: 250, category: 'פנאי' },
    ]
    expect(actualCategories(rows, charges, '2030-05')).toEqual([
      { name: 'שכירות', monthlyAmount: 6000 },
      { name: 'מזון', monthlyAmount: 750 },
      { name: 'פנאי', monthlyAmount: 250 },
    ])
  })

  it('keeps a card payment the card files don’t cover under the cards', () => {
    const rows = [bank('2030-05-10', { debit: 1200, isCardPayment: true })]
    expect(actualCategories(rows, [{ id: 'f1', billingDate: '2030-05-10', amount: 200, category: 'מזון' }], '2030-05')).toEqual([
      { name: 'כרטיסי אשראי', monthlyAmount: 1000 },
      { name: 'מזון', monthlyAmount: 200 },
    ])
  })

  it('comes with the projection: the past months and the latest one so far', () => {
    const p = ok(projectBalance(input({ past: [{ month: '2030-05', balance: 1 }, { month: '2030-06', balance: 2 }, { month: '2030-07', balance: 3 }] })))
    expect(p.actualCategories.map(a => a.month)).toEqual(['2030-05', '2030-06', '2030-07'])
    expect(p.actualCategories[0].categories).toEqual([{ name: 'שכירות', monthlyAmount: 6000 }])
  })
})
