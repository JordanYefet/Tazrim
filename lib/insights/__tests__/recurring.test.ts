import { describe, it, expect } from 'vitest'
import {
  detectRecurring,
  normalizeMerchant,
  isCardPaymentDescription,
  recurringMonthlyTotal,
  fromBankRow,
  fromCardRow,
  type RecurringTransaction,
  type RecurringSeries,
} from '../recurring'

let seq = 0
function tx(
  date: string,
  amount: number,
  description: string,
  extra: Partial<RecurringTransaction> = {}
): RecurringTransaction {
  return { id: `t${++seq}`, date, amount, description, source: 'card', ...extra }
}

/** One charge per month on `day`, for months [from..to] (1-12) of 2026 */
function monthly(
  description: string,
  amount: number | number[],
  months: number[],
  day = 5,
  extra: Partial<RecurringTransaction> = {}
) {
  return months.map((m, i) =>
    tx(
      `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      Array.isArray(amount) ? amount[i] : amount,
      description,
      extra
    )
  )
}

const today = '2026-07-10'
const only = (series: RecurringSeries[], name: string) => {
  const found = series.filter(s => s.name.includes(name))
  expect(found).toHaveLength(1)
  return found[0]
}

describe('normalizeMerchant', () => {
  it('trims, collapses whitespace and lowercases latin letters', () => {
    expect(normalizeMerchant('  STREAMLY    PLUS   ')).toBe('streamly plus')
  })

  it('strips reference numbers and alphanumeric order ids', () => {
    expect(normalizeMerchant('STREAMLY P1A2B3C4D     OSLO     NO')).toBe('streamly oslo no')
    expect(normalizeMerchant('CLOUDBOX         123-4567890   US')).toBe('cloudbox us')
    expect(normalizeMerchant('חדר כושר (9999) בע"מ')).toBe('חדר כושר בע"מ')
  })

  it('keeps short numbers that are part of the name', () => {
    expect(normalizeMerchant('GYM 24')).toBe('gym 24')
  })
})

describe('detectRecurring', () => {
  it('detects a clean monthly series', () => {
    const r = detectRecurring(monthly('Streamly', 37.5, [1, 2, 3, 4, 5, 6]), { today })
    expect(r).toHaveLength(1)
    const s = r[0]
    expect(s.name).toBe('Streamly')
    expect(s.cadence).toBe('monthly')
    expect(s.amount).toBe(37.5)
    expect(s.latestAmount).toBe(37.5)
    expect(s.monthlyAmount).toBe(37.5)
    expect(s.occurrences).toBe(6)
    expect(s.firstDate).toBe('2026-01-05')
    expect(s.lastDate).toBe('2026-06-05')
    expect(s.nextDate).toBe('2026-07-05')
    expect(s.source).toBe('card')
    expect(s.active).toBe(true)
    expect(s.priceIncrease).toBeNull()
    expect(s.transactionIds).toHaveLength(6)
  })

  it('tolerates jittered charge dates', () => {
    const txs = [
      tx('2026-01-03', 120, 'GymCo'),
      tx('2026-01-31', 120, 'GymCo'),
      tx('2026-03-06', 120, 'GymCo'),
      tx('2026-04-02', 120, 'GymCo'),
      tx('2026-05-08', 120, 'GymCo'),
    ]
    const r = detectRecurring(txs, { today: '2026-05-20' })
    expect(r).toHaveLength(1)
    expect(r[0].occurrences).toBe(5)
    expect(r[0].cadence).toBe('monthly')
  })

  it('tolerates an odd skipped month', () => {
    const r = detectRecurring(monthly('Streamly', 30, [1, 2, 4, 5, 6]), { today })
    expect(r).toHaveLength(1)
    expect(r[0].occurrences).toBe(5)
  })

  it('rejects series with too many skipped months', () => {
    expect(detectRecurring(monthly('Streamly', 30, [1, 3, 5]), { today })).toHaveLength(0)
  })

  it('rejects irregular gaps', () => {
    const txs = [tx('2026-01-05', 30, 'Cafe'), tx('2026-01-19', 30, 'Cafe'), tx('2026-03-30', 30, 'Cafe')]
    expect(detectRecurring(txs, { today })).toHaveLength(0)
  })

  it('accepts amount variation inside the tolerance', () => {
    const r = detectRecurring(monthly('PowerCo', [200, 212, 191, 205], [2, 3, 4, 5]), { today })
    expect(r).toHaveLength(1)
    expect(r[0].amount).toBe(202.5)
  })

  it('rejects amount variation outside the tolerance', () => {
    expect(detectRecurring(monthly('MarketCo', [200, 320, 140, 250], [2, 3, 4, 5]), { today })).toHaveLength(0)
  })

  it('splits same-named charges with different amounts into separate series', () => {
    const txs = [
      ...monthly('Standing Order', 100, [1, 2, 3, 4], 1, { source: 'bank' }),
      ...monthly('Standing Order', 450, [1, 2, 3, 4], 1, { source: 'bank' }),
    ]
    const r = detectRecurring(txs, { today: '2026-04-20' })
    expect(r.map(s => s.amount).sort((a, b) => a - b)).toEqual([100, 450])
    expect(new Set(r.map(s => s.key)).size).toBe(2)
  })

  it('flags a price increase with the old and new amounts', () => {
    const r = detectRecurring(monthly('Streamly', [40, 40, 40, 40, 50, 50], [1, 2, 3, 4, 5, 6]), { today })
    expect(r).toHaveLength(1)
    const s = r[0]
    expect(s.occurrences).toBe(6)
    expect(s.priceIncrease).toEqual({ from: 40, to: 50, since: '2026-05-05' })
    expect(s.latestAmount).toBe(50)
    expect(s.monthlyAmount).toBe(50)
  })

  it('flags a single latest charge above the previous level', () => {
    const r = detectRecurring(monthly('Streamly', [40, 40, 40, 48], [3, 4, 5, 6]), { today })
    expect(r[0].priceIncrease).toEqual({ from: 40, to: 48, since: '2026-06-05' })
  })

  it('does not chain random amounts into a series through repeated jumps', () => {
    expect(detectRecurring(monthly('MarketCo', [100, 130, 170, 220], [2, 3, 4, 5]), { today })).toHaveLength(0)
  })

  it('flags a subscription that started recently', () => {
    const txs = [
      tx('2026-01-15', 300, 'Old Bill'), // data goes back further than the new series
      ...monthly('NewTube', 25, [4, 5, 6]),
      ...monthly('Streamly', 40, [1, 2, 3, 4, 5, 6]),
    ]
    const r = detectRecurring(txs, { today })
    expect(only(r, 'NewTube').isNew).toBe(true)
    expect(only(r, 'Streamly').isNew).toBe(false)
  })

  it('does not call everything new when the data itself only just started', () => {
    const r = detectRecurring(monthly('NewTube', 25, [4, 5, 6]), { today })
    expect(r[0].isNew).toBe(false)
  })

  it('does not flag one-off or two-occurrence merchants', () => {
    const txs = [
      tx('2026-03-01', 500, 'FurnitureCo'),
      ...monthly('Twice', 20, [4, 5]),
    ]
    expect(detectRecurring(txs, { today })).toHaveLength(0)
  })

  it('respects minOccurrences', () => {
    expect(detectRecurring(monthly('Twice', 20, [4, 5]), { today, minOccurrences: 2 })).toHaveLength(1)
  })

  it('ignores refunds and income (non-positive amounts)', () => {
    expect(detectRecurring(monthly('Refundly', -20, [1, 2, 3, 4]), { today })).toHaveLength(0)
  })

  it('marks a series inactive once it stops for more than a skipped cycle', () => {
    const r = detectRecurring(monthly('Streamly', 40, [1, 2, 3]), { today: '2026-07-10' })
    expect(r[0].active).toBe(false)
  })

  it('rolls the next expected date forward past a missed charge', () => {
    const r = detectRecurring(monthly('Streamly', 40, [1, 2, 3, 4, 5]), { today: '2026-06-20' })
    expect(r[0].active).toBe(true)
    expect(r[0].nextDate).toBe('2026-07-05')
  })

  it('only looks for weekly series when asked (habits look weekly too)', () => {
    const weekly = ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01'].map(d =>
      tx(d, 15, 'Corner Cafe')
    )
    expect(detectRecurring(weekly, { today: '2026-06-03' })).toHaveLength(0)
  })

  it('detects weekly and yearly cadences', () => {
    const weekly = ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01'].map(d =>
      tx(d, 15, 'Veggie Box')
    )
    const yearly = ['2023-09-01', '2024-09-02', '2025-08-30'].map(d => tx(d, 600, 'Insurely'))
    const r = detectRecurring([...weekly, ...yearly], { today: '2026-06-03', cadences: ['weekly', 'monthly', 'yearly'] })
    const w = only(r, 'Veggie Box')
    expect(w.cadence).toBe('weekly')
    expect(w.monthlyAmount).toBeCloseTo((15 * 52) / 12)
    const y = only(r, 'Insurely')
    expect(y.cadence).toBe('yearly')
    expect(y.monthlyAmount).toBe(50)
    expect(y.nextDate).toBe('2026-08-30')
  })

  it('groups by original description so an alias rename keeps the same key', () => {
    const before = detectRecurring(
      monthly('STREAMLY P1A2B3C4D', 40, [1, 2, 3], 5, { originalDescription: 'STREAMLY P1A2B3C4D' }),
      { today: '2026-03-20' }
    )
    const after = detectRecurring(
      [
        ...monthly('Streamly', 40, [1, 2, 3], 5, { originalDescription: 'STREAMLY P1A2B3C4D' }),
        tx('2026-04-05', 40, 'Streamly', { originalDescription: 'STREAMLY P9Z8Y7X6W' }),
      ],
      { today: '2026-04-20' }
    )
    expect(after[0].key).toBe(before[0].key)
    expect(after[0].name).toBe('Streamly')
    expect(after[0].occurrences).toBe(4)
  })

  it('keeps bank and card rows, and different accounts, apart', () => {
    const txs = [
      ...monthly('Streamly', 40, [1, 2, 3, 4], 5, { source: 'card' }),
      ...monthly('Streamly', 40, [1, 2, 3, 4], 5, { source: 'bank' }),
      ...monthly('Streamly', 40, [1, 2, 3, 4], 9, { source: 'card', accountId: 'acc-2' }),
    ]
    const r = detectRecurring(txs, { today: '2026-04-20' })
    expect(r).toHaveLength(3)
    expect(new Set(r.map(s => s.key)).size).toBe(3)
    expect(r.filter(s => s.source === 'bank')).toHaveLength(1)
  })

  it('handles mixed bank and card input, flagging the card payment debit', () => {
    const txs = [
      ...monthly('Streamly', 40, [1, 2, 3, 4], 5, { source: 'card' }),
      ...monthly('GymCo', 150, [1, 2, 3, 4], 8, { source: 'card' }),
      ...monthly('מקס איט פיננסים', [900, 880, 910, 905], [1, 2, 3, 4], 10, { source: 'bank' }),
      ...monthly('PowerCo', 250, [1, 2, 3, 4], 15, { source: 'bank' }),
    ]
    const r = detectRecurring(txs, { today: '2026-04-20' })
    expect(r).toHaveLength(4)
    const payment = r.find(s => s.source === 'bank' && s.isCardPayment)!
    expect(payment.amount).toBe(902.5)
    expect(r.filter(s => s.isCardPayment)).toHaveLength(1)
    expect(only(r, 'PowerCo').isCardPayment).toBe(false)
  })

  it('gives identical same-merchant series distinct, stable keys', () => {
    const txs = [
      ...monthly('GymCo', 150, [1, 2, 3, 4], 5),
      ...monthly('GymCo', 150, [1, 2, 3, 4], 20),
    ]
    const r = detectRecurring(txs, { today: '2026-04-25' })
    expect(r).toHaveLength(2)
    expect(new Set(r.map(s => s.key)).size).toBe(2)
    const again = detectRecurring([...txs, ...monthly('GymCo', 150, [5], 5)], { today: '2026-05-10' })
    expect(new Set(again.map(s => s.key))).toEqual(new Set(r.map(s => s.key)))
  })

  it('keeps a card-company payment as one series even though its amount swings', () => {
    const txs = monthly('מקס איט פיננסים', [900, 1400, 700, 1100, 950], [1, 2, 3, 4, 5], 10, { source: 'bank' })
    const r = detectRecurring(txs, { today: '2026-05-20' })
    expect(r).toHaveLength(1)
    expect(r[0].isCardPayment).toBe(true)
    expect(r[0].occurrences).toBe(5)
    expect(r[0].priceIncrease).toBeNull()
  })

  it('sorts by monthly amount, biggest first', () => {
    const txs = [
      ...monthly('Small', 10, [1, 2, 3]),
      ...monthly('Big', 100, [1, 2, 3]),
      ...monthly('Mid', 50, [1, 2, 3]),
    ]
    expect(detectRecurring(txs, { today: '2026-03-20' }).map(s => s.name)).toEqual(['Big', 'Mid', 'Small'])
  })

  it('accepts Date objects', () => {
    const txs = [1, 2, 3].map(m => tx('', 40, 'Streamly', { date: new Date(2026, m - 1, 5) }))
    const r = detectRecurring(txs, { today: new Date(2026, 2, 20) })
    expect(r[0].firstDate).toBe('2026-01-05')
  })

  it('defaults "today" to the latest transaction of each source', () => {
    const txs = [
      ...monthly('Streamly', 40, [1, 2, 3], 5, { source: 'card' }),
      ...monthly('PowerCo', 250, [1, 2, 3, 4, 5, 6, 7, 8], 15, { source: 'bank' }),
    ]
    // Card data ends in March; that alone must not make the card series inactive
    const r = detectRecurring(txs)
    expect(only(r, 'Streamly').active).toBe(true)
  })

  it('defaults "today" per account, not just per source', () => {
    const txs = [
      ...monthly('Streamly', 40, [1, 2, 3], 5, { source: 'card', accountId: 'card-old' }),
      ...monthly('GymCo', 150, [1, 2, 3, 4, 5, 6, 7, 8], 8, { source: 'card', accountId: 'card-new' }),
    ]
    // The older card's statements stop in March; its series is still current as of its own data
    const r = detectRecurring(txs)
    expect(only(r, 'Streamly').active).toBe(true)
    expect(only(r, 'Streamly').accountId).toBe('card-old')
  })

  it('labels installment plans instead of treating them as subscriptions', () => {
    const txs = monthly('SofaCo', 250, [1, 2, 3, 4], 12, { isInstallment: true })
    const r = detectRecurring(txs, { today: '2026-04-20' })
    expect(r).toHaveLength(1)
    expect(r[0].isInstallment).toBe(true)
    expect(detectRecurring(monthly('Streamly', 40, [1, 2, 3]), { today: '2026-03-20' })[0].isInstallment).toBe(false)
  })
})

describe('isCardPaymentDescription', () => {
  it('recognises card-company debits on the bank statement', () => {
    expect(isCardPaymentDescription('מקס איט פיננסים בעמ')).toBe(true)
    expect(isCardPaymentDescription('כרטיסי אשראי לישראל')).toBe(true)
    expect(isCardPaymentDescription('מאסטרקרד חיוב')).toBe(true)
    expect(isCardPaymentDescription('ישראכרט')).toBe(true)
    expect(isCardPaymentDescription('כאל-י')).toBe(true)
  })

  it('does not match ordinary merchants', () => {
    expect(isCardPaymentDescription('PowerCo')).toBe(false)
    expect(isCardPaymentDescription('מיכאל ספרים')).toBe(false)
    expect(isCardPaymentDescription('ספריית העיר')).toBe(false)
  })
})

describe('recurringMonthlyTotal', () => {
  const txs = [
    ...monthly('Streamly', 40, [1, 2, 3, 4], 5, { source: 'card' }),
    ...monthly('GymCo', 150, [1, 2, 3, 4], 8, { source: 'card' }),
    ...monthly('Ended', 70, [1, 2], 9, { source: 'card' }),
    tx('2025-12-09', 70, 'Ended'),
    ...monthly('מקס איט פיננסים', 900, [1, 2, 3, 4], 10, { source: 'bank' }),
    ...monthly('PowerCo', 250, [1, 2, 3, 4], 15, { source: 'bank' }),
    ...['2023-09-01', '2024-09-02', '2025-08-30'].map(d => tx(d, 600, 'Insurely', { source: 'bank' })),
    ...monthly('SofaCo', 250, [1, 2, 3, 4], 12, { isInstallment: true }),
  ]
  const series = detectRecurring(txs, { today: '2026-04-20' })

  it('sums active series of the chosen sources, never the card payment itself', () => {
    // card 40 + 150, bank 250 + 600/12; the 900 card payment and the inactive series are left out
    expect(recurringMonthlyTotal(series, { sources: ['bank', 'card'] })).toBe(490)
  })

  it('leaves installment plans out unless asked', () => {
    expect(recurringMonthlyTotal(series, { sources: ['card'], excludeInstallments: false })).toBe(440)
  })

  it('can be limited to one source', () => {
    expect(recurringMonthlyTotal(series, { sources: ['card'] })).toBe(190)
    expect(recurringMonthlyTotal(series, { sources: ['bank'] })).toBe(300)
  })

  it('can include the card payment when card rows are not in the total', () => {
    expect(recurringMonthlyTotal(series, { sources: ['bank'], excludeCardPayments: false })).toBe(1200)
  })

  it('skips dismissed keys', () => {
    const gym = series.find(s => s.name === 'GymCo')!
    expect(recurringMonthlyTotal(series, { sources: ['card'], excludedKeys: [gym.key] })).toBe(40)
  })
})

describe('row adapters', () => {
  it('maps a bank row: debit is the charge amount', () => {
    const t = fromBankRow({
      id: 'b1',
      date: new Date(2026, 0, 5),
      description: 'PowerCo',
      originalDescription: 'POWERCO 12345',
      debit: 250,
      credit: 0,
    })
    expect(t).toMatchObject({ id: 'b1', amount: 250, source: 'bank', description: 'PowerCo', originalDescription: 'POWERCO 12345' })
  })

  it('maps a card row: transaction date, charged amount, overridden category', () => {
    const t = fromCardRow({
      id: 'c1',
      transactionDate: new Date(2026, 0, 5),
      merchantName: 'Streamly',
      originalMerchantName: 'STREAMLY P1A2B3C4D',
      chargedAmount: 40,
      category: 'פנאי',
      categoryOverride: 'מנויים',
    })
    expect(t).toMatchObject({ id: 'c1', amount: 40, source: 'card', category: 'מנויים', originalDescription: 'STREAMLY P1A2B3C4D' })
    expect(t.isInstallment).toBe(false)
  })

  it('maps an installment card row: flagged, dated by its billing date', () => {
    const t = fromCardRow({
      id: 'c2',
      transactionDate: new Date(2026, 0, 5),
      billingDate: new Date(2026, 2, 2),
      merchantName: 'SofaCo',
      chargedAmount: 250,
      transactionType: 'תשלומים',
      accountId: 'acc-card',
    })
    // every installment row keeps the purchase date; the billing date is what recurs
    expect(t).toMatchObject({ isInstallment: true, date: new Date(2026, 2, 2), accountId: 'acc-card' })
  })
})
