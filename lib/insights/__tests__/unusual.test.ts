import { describe, it, expect } from 'vitest'
import {
  detectUnusualTransactions,
  normalizeMerchant,
  fromBankTransaction,
  fromCardTransaction,
  type UnusualInput,
} from '../unusual'

// All merchants, amounts and dates below are made up.
let seq = 0
function tx(
  date: string,
  amount: number,
  description: string,
  extra: Partial<UnusualInput> = {}
): UnusualInput {
  seq += 1
  return { id: `t${String(seq).padStart(3, '0')}`, date, amount, description, source: 'card', ...extra }
}

/** Four ordinary visits to a fake café, then whatever the test adds */
function cafeHistory() {
  return [
    tx('2025-01-03', 40, 'Fake Cafe', { category: 'מסעדות' }),
    tx('2025-01-10', 45, 'Fake Cafe', { category: 'מסעדות' }),
    tx('2025-01-17', 50, 'Fake Cafe', { category: 'מסעדות' }),
    tx('2025-01-24', 42, 'Fake Cafe', { category: 'מסעדות' }),
  ]
}

describe('normalizeMerchant', () => {
  it('ignores case, spacing, punctuation and long reference numbers', () => {
    expect(normalizeMerchant('  Fake  Store*  ')).toBe('fake store')
    expect(normalizeMerchant('FAKE STORE 123456')).toBe('fake store')
    expect(normalizeMerchant('חנות-בדיקה')).toBe('חנות בדיקה')
  })
})

describe('merchant_outlier', () => {
  it('flags a one-off large charge at a merchant with enough history', () => {
    const history = cafeHistory()
    const big = tx('2025-02-01', 420, 'FAKE CAFE', { category: 'מסעדות' })
    const r = detectUnusualTransactions([...history, big])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe(big.id)
    const flag = r[0].flags[0]
    expect(flag.reason).toBe('merchant_outlier')
    if (flag.reason !== 'merchant_outlier') throw new Error()
    expect(flag.baseline).toBe(43.5) // median of 40, 42, 45, 50
    expect(flag.historyCount).toBe(4)
    expect(flag.ratio).toBeCloseTo(420 / 43.5)
  })

  it('does not flag normal variation', () => {
    const history = cafeHistory()
    const r = detectUnusualTransactions([...history, tx('2025-02-01', 95, 'Fake Cafe', { category: 'מסעדות' })])
    expect(r).toEqual([])
  })

  it('needs at least three earlier visits', () => {
    const r = detectUnusualTransactions([
      tx('2025-01-03', 300, 'Fake Gym'),
      tx('2025-01-10', 300, 'Fake Gym'),
      tx('2025-02-01', 3000, 'Fake Gym'),
    ])
    expect(r).toEqual([])
  })

  it('does not flag an amount already seen at the same merchant', () => {
    const r = detectUnusualTransactions([
      tx('2025-01-01', 100, 'Fake Garage'),
      tx('2025-01-08', 100, 'Fake Garage'),
      tx('2025-01-15', 100, 'Fake Garage'),
      tx('2025-01-22', 1500, 'Fake Garage'),
      tx('2025-02-20', 1200, 'Fake Garage'),
    ])
    expect(r.map(u => u.amount)).toEqual([1500])
  })
})

describe('noise control', () => {
  it('ignores amounts below the minimum', () => {
    const history = [
      tx('2025-01-03', 10, 'Fake Kiosk'),
      tx('2025-01-10', 12, 'Fake Kiosk'),
      tx('2025-01-17', 11, 'Fake Kiosk'),
    ]
    const odd = tx('2025-02-01', 150, 'Fake Kiosk') // ~14× usual but only ₪150
    expect(detectUnusualTransactions([...history, odd])).toEqual([])
    expect(detectUnusualTransactions([...history, odd], { minAmount: 100 }).map(u => u.id)).toEqual([odd.id])
  })

  it('ignores income and refunds (non-positive amounts)', () => {
    const history = cafeHistory()
    const r = detectUnusualTransactions([...history, tx('2025-02-01', -900, 'Fake Cafe')])
    expect(r).toEqual([])
  })

  it('exempts recurring transactions by id', () => {
    const rent = [
      tx('2025-01-28', 5000, 'Fake Landlord', { category: 'דיור', source: 'bank' }),
      tx('2025-02-28', 5000, 'Fake Landlord', { category: 'דיור', source: 'bank' }),
    ]
    const groceries = Array.from({ length: 5 }, (_, i) =>
      tx(`2025-01-${String(i * 5 + 2).padStart(2, '0')}`, 300, `Fake Grocer ${'abcde'[i]}`, { category: 'דיור' })
    )
    const all = [...groceries, ...rent]
    expect(detectUnusualTransactions(all).length).toBeGreaterThan(0)
    expect(detectUnusualTransactions(all, { recurring: { ids: rent.map(t => t.id) } })).toEqual([])
  })

  it('a recurring merchant key exempts the category check but not a price jump or a double charge', () => {
    const sub = [
      tx('2025-01-05', 300, 'Fake Streaming'),
      tx('2025-02-05', 300, 'Fake Streaming'),
      tx('2025-03-05', 300, 'Fake Streaming'),
      tx('2025-03-06', 300, 'Fake Streaming'), // double-billed
      tx('2025-04-05', 1500, 'Fake Streaming'),
    ]
    const r = detectUnusualTransactions(sub, { recurring: { merchantKeys: ['fake streaming'] } })
    expect(r.map(u => [u.amount, u.date, u.flags.map(f => f.reason)])).toEqual([
      [1500, '2025-04-05', ['merchant_outlier']],
      [300, '2025-03-06', ['possible_duplicate']],
    ])
  })

  it('still flags a double-billed recurring charge whose ids are exempt', () => {
    const groceries = Array.from({ length: 5 }, (_, i) =>
      tx(`2025-01-${String(i * 3 + 1).padStart(2, '0')}`, 220, `Fake Grocer ${'abcde'[i]}`, { category: 'בית' })
    )
    const a = tx('2025-01-28', 4000, 'Fake Landlord', { category: 'בית', source: 'bank' })
    const b = tx('2025-01-29', 4000, 'Fake Landlord', { category: 'בית', source: 'bank' })
    const r = detectUnusualTransactions([...groceries, a, b], { recurring: { ids: [a.id, b.id] } })
    expect(r.map(u => [u.id, u.flags.map(f => f.reason)])).toEqual([[b.id, ['possible_duplicate']]])
  })

  it('exempts via a predicate', () => {
    const history = cafeHistory()
    const big = tx('2025-02-01', 420, 'Fake Cafe')
    const r = detectUnusualTransactions([...history, big], { recurring: { isRecurring: t => t.id === big.id } })
    expect(r).toEqual([])
  })

  it('excluded rows (e.g. the bank card-payment debit) are neither flagged nor used as history', () => {
    const bills = [
      tx('2025-01-10', 1000, 'Fake Card Co', { source: 'bank' }),
      tx('2025-02-10', 1100, 'Fake Card Co', { source: 'bank' }),
      tx('2025-03-10', 900, 'Fake Card Co', { source: 'bank' }),
      tx('2025-04-10', 9000, 'Fake Card Co', { source: 'bank' }),
    ]
    expect(detectUnusualTransactions(bills)).toHaveLength(1)
    const isCardPayment = (t: UnusualInput) => t.source === 'bank' && normalizeMerchant(t.description) === 'fake card co'
    expect(detectUnusualTransactions(bills, { isExcluded: isCardPayment })).toEqual([])
  })
})

describe('category_outlier', () => {
  const groceries = [
    tx('2025-01-02', 200, 'Fake Market A', { category: 'מזון' }),
    tx('2025-01-06', 250, 'Fake Market B', { category: 'מזון' }),
    tx('2025-01-09', 220, 'Fake Market C', { category: 'מזון' }),
    tx('2025-01-13', 180, 'Fake Market A', { category: 'מזון' }),
    tx('2025-01-16', 240, 'Fake Market D', { category: 'מזון' }),
  ]

  it('falls back to the category norm when the merchant has no history', () => {
    const big = tx('2025-02-01', 1800, 'Fake Deli', { category: 'מזון' })
    const r = detectUnusualTransactions([...groceries, big])
    expect(r.map(u => u.id)).toEqual([big.id])
    const flag = r[0].flags[0]
    expect(flag.reason).toBe('category_outlier')
    if (flag.reason !== 'category_outlier') throw new Error()
    expect(flag.category).toBe('מזון')
    expect(flag.baseline).toBe(220)
    expect(flag.historyCount).toBe(5)
  })

  it('does not flag an ordinary amount at a new merchant', () => {
    const r = detectUnusualTransactions([...groceries, tx('2025-02-01', 400, 'Fake Deli', { category: 'מזון' })])
    expect(r).toEqual([])
  })

  it('does not flag an amount the category has already seen', () => {
    // the median stays low (230) but a ₪2000 purchase already happened in this category
    const withBigShop = [...groceries, tx('2024-12-30', 2000, 'Fake Market B', { category: 'מזון' })]
    const r = detectUnusualTransactions([...withBigShop, tx('2025-02-01', 1800, 'Fake Deli', { category: 'מזון' })])
    expect(r).toEqual([])
  })

  it('needs enough category history and a category', () => {
    const few = groceries.slice(0, 3)
    expect(detectUnusualTransactions([...few, tx('2025-02-01', 1800, 'Fake Deli', { category: 'מזון' })])).toEqual([])
    expect(detectUnusualTransactions([...groceries, tx('2025-02-01', 1800, 'Fake Deli')])).toEqual([])
  })
})

describe('possible_duplicate', () => {
  it('flags the same merchant and amount within two days', () => {
    const a = tx('2025-03-10', 249.9, 'Fake Shoes')
    const b = tx('2025-03-11', 249.9, 'FAKE SHOES')
    const r = detectUnusualTransactions([a, b])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe(b.id)
    expect(r[0].flags).toEqual([{ reason: 'possible_duplicate', duplicateOfId: a.id, daysApart: 1 }])
  })

  it('ignores repeats further apart, different amounts, or other sources', () => {
    expect(detectUnusualTransactions([tx('2025-03-10', 249.9, 'Fake Shoes'), tx('2025-03-13', 249.9, 'Fake Shoes')])).toEqual([])
    expect(detectUnusualTransactions([tx('2025-03-10', 249.9, 'Fake Shoes'), tx('2025-03-10', 250.9, 'Fake Shoes')])).toEqual([])
    expect(
      detectUnusualTransactions([
        tx('2025-03-10', 249.9, 'Fake Shoes', { source: 'bank' }),
        tx('2025-03-10', 249.9, 'Fake Shoes', { source: 'card' }),
      ])
    ).toEqual([])
  })

  it('ignores small repeats like two coffees', () => {
    expect(detectUnusualTransactions([tx('2025-03-10', 18, 'Fake Cafe'), tx('2025-03-10', 18, 'Fake Cafe')])).toEqual([])
  })

  it('does not pair a transaction with itself or across accounts', () => {
    const a = tx('2025-03-10', 500, 'Fake Shop', { accountId: 'acc-1' })
    expect(detectUnusualTransactions([a, a])).toEqual([])
    expect(detectUnusualTransactions([a, tx('2025-03-10', 500, 'Fake Shop', { accountId: 'acc-2' })])).toEqual([])
  })

  it('only flags the first occurrence of a repeating same-day pair (e.g. two kids, one class)', () => {
    const months = ['2025-01', '2025-02', '2025-03']
    const rows = months.flatMap(m => [tx(`${m}-15`, 120, 'Fake Club'), tx(`${m}-15`, 120, 'Fake Club')])
    const r = detectUnusualTransactions(rows)
    expect(r.map(u => u.date)).toEqual(['2025-01-15'])
  })

  it('skips categories excluded from duplicate checks (e.g. person-to-person transfers)', () => {
    const rows = [
      tx('2025-03-10', 200, 'Fake Pay App', { category: 'העברות' }),
      tx('2025-03-10', 200, 'Fake Pay App', { category: 'העברות' }),
    ]
    expect(detectUnusualTransactions(rows)).toHaveLength(1)
    expect(detectUnusualTransactions(rows, { duplicateExcludedCategories: ['העברות'] })).toEqual([])
  })

  it('points every copy in a cluster at the first one', () => {
    const a = tx('2025-03-10', 500, 'Fake Shop')
    const b = tx('2025-03-10', 500, 'Fake Shop')
    const c = tx('2025-03-11', 500, 'Fake Shop')
    const r = detectUnusualTransactions([c, b, a])
    expect(r.map(u => [u.id, u.flags[0].reason === 'possible_duplicate' && u.flags[0].duplicateOfId])).toEqual([
      [c.id, a.id],
      [b.id, a.id],
    ])
  })
})

describe('output', () => {
  it('is ordered newest first, then by amount, then by id, regardless of input order', () => {
    const history = cafeHistory()
    const big1 = tx('2025-02-01', 420, 'Fake Cafe')
    const d1 = tx('2025-02-05', 300, 'Fake Shop')
    const d2 = tx('2025-02-05', 300, 'Fake Shop')
    const e1 = tx('2025-02-05', 700, 'Fake Bags')
    const e2 = tx('2025-02-06', 700, 'Fake Bags')
    const all = [...history, big1, d1, d2, e1, e2]
    const ids = detectUnusualTransactions(all).map(u => u.id)
    expect(ids).toEqual([e2.id, d2.id, big1.id])
    expect(detectUnusualTransactions([...all].reverse()).map(u => u.id)).toEqual(ids)
  })

  it('can limit flagging to recent transactions while using all history', () => {
    const history = cafeHistory()
    const big1 = tx('2025-02-01', 420, 'Fake Cafe')
    const big2 = tx('2025-03-01', 900, 'Fake Cafe')
    const r = detectUnusualTransactions([...history, big1, big2], { since: '2025-02-15' })
    expect(r.map(u => u.id)).toEqual([big2.id])
  })

  it('can limit flagging to a date range with `until`', () => {
    const history = cafeHistory()
    const big1 = tx('2025-02-01', 420, 'Fake Cafe')
    const big2 = tx('2025-03-01', 900, 'Fake Cafe')
    const r = detectUnusualTransactions([...history, big1, big2], { since: '2025-01-15', until: '2025-02-28' })
    expect(r.map(u => u.id)).toEqual([big1.id])
  })

  it('matches since/until against `periodDate` when given, keeping `date` for history and display', () => {
    const history = cafeHistory()
    // Bought in February, counted in the April period (e.g. a card's billing month)
    const big = { ...tx('2025-02-01', 420, 'Fake Cafe'), periodDate: '2025-04-02' }
    expect(detectUnusualTransactions([...history, big], { since: '2025-02-01', until: '2025-02-28' })).toEqual([])
    const [u] = detectUnusualTransactions([...history, big], { since: '2025-04-01', until: '2025-04-30' })
    expect(u).toMatchObject({ id: big.id, date: '2025-02-01' })
    expect(u.flags[0].reason).toBe('merchant_outlier')
  })

  it('carries the display fields of the transaction', () => {
    const a = tx('2025-03-10', 500, 'Fake Shop', { category: 'קניות', accountId: 'acc-1' })
    const b = tx('2025-03-10', 500, 'Fake Shop', { category: 'קניות', accountId: 'acc-1' })
    const [u] = detectUnusualTransactions([a, b])
    expect(u).toMatchObject({
      id: b.id,
      date: '2025-03-10',
      amount: 500,
      description: 'Fake Shop',
      merchantKey: 'fake shop',
      source: 'card',
      accountId: 'acc-1',
      category: 'קניות',
    })
  })
})

describe('adapters', () => {
  it('maps bank rows: debit is an expense, credit is income', () => {
    expect(
      fromBankTransaction({ id: 'b1', date: new Date(2025, 0, 5), description: 'Fake Bank Row', debit: 120, credit: 0 })
    ).toMatchObject({ id: 'b1', amount: 120, source: 'bank', category: null })
    expect(
      fromBankTransaction({ id: 'b2', date: new Date(2025, 0, 5), description: 'Fake Salary', debit: 0, credit: 900 })
    ).toMatchObject({ amount: -900 })
  })

  it('maps card rows using the transaction date and the category override', () => {
    const d = new Date(2025, 0, 5)
    expect(
      fromCardTransaction({
        id: 'c1',
        transactionDate: d,
        merchantName: 'Fake Merchant',
        chargedAmount: 80,
        category: 'אחר',
        categoryOverride: 'מזון',
      })
    ).toEqual({ id: 'c1', date: d, amount: 80, description: 'Fake Merchant', source: 'card', category: 'מזון' })
  })

  it('maps the billing date of card rows to the period date', () => {
    const d = new Date(2025, 0, 5)
    const billed = new Date(2025, 2, 2)
    expect(
      fromCardTransaction({ id: 'c2', transactionDate: d, billingDate: billed, merchantName: 'Fake Merchant', chargedAmount: 80, category: 'אחר' })
    ).toMatchObject({ date: d, periodDate: billed })
  })
})
