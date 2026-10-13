import { describe, it, expect } from 'vitest'
import { applyOverrides, summarizeRecurring, recurringTransactionIds, type RecurringOverrideInput } from '../recurring-overrides'
import type { RecurringSeries } from '../recurring'

// Made-up series only
function series(over: Partial<RecurringSeries> & { key: string }): RecurringSeries {
  return {
    baseKey: over.key.split('|').slice(0, 3).join('|'),
    name: 'Streamly',
    merchant: 'streamly',
    source: 'card',
    category: null,
    cadence: 'monthly',
    amount: 40,
    latestAmount: 40,
    monthlyAmount: 40,
    occurrences: 4,
    firstDate: '2026-01-05',
    lastDate: '2026-04-05',
    nextDate: '2026-05-05',
    active: true,
    isNew: false,
    priceIncrease: null,
    isCardPayment: false,
    isInstallment: false,
    transactionIds: [over.key + ':1', over.key + ':2', over.key + ':3'],
    ...over,
  }
}

const override = (o: Partial<RecurringOverrideInput> & { key: string }): RecurringOverrideInput => ({
  baseKey: o.key.split('|').slice(0, 3).join('|'),
  status: null,
  displayName: null,
  ...o,
})

const streamly = series({ key: 'card|acc-1|streamly|monthly' })
const gym = series({ key: 'card|acc-1|gymco|monthly', name: 'GymCo', merchant: 'gymco', monthlyAmount: 150, latestAmount: 150 })

describe('applyOverrides', () => {
  it('leaves series without an override untouched', () => {
    const [s] = applyOverrides([streamly], [])
    expect(s.status).toBeNull()
    expect(s.name).toBe('Streamly')
    expect(s.detectedName).toBe('Streamly')
    expect(s.overrideKey).toBeNull()
  })

  it('applies status and display name by key', () => {
    const [s] = applyOverrides([streamly], [override({ key: streamly.key, status: 'dismissed', displayName: 'Movies' })])
    expect(s.status).toBe('dismissed')
    expect(s.name).toBe('Movies')
    expect(s.detectedName).toBe('Streamly')
    expect(s.overrideKey).toBe(streamly.key)
  })

  it('falls back to the base key when the merchant has a single series', () => {
    // saved when the key had an amount suffix; the merchant now has one series again
    const [s] = applyOverrides([streamly], [override({ key: streamly.key + '|40', status: 'confirmed' })])
    expect(s.status).toBe('confirmed')
    expect(s.overrideKey).toBe(streamly.key + '|40')
  })

  it('does not fall back when the base key is ambiguous', () => {
    const a = series({ key: 'card|acc-1|standing order|monthly|100', baseKey: 'card|acc-1|standing order' })
    const b = series({ key: 'card|acc-1|standing order|monthly|450', baseKey: 'card|acc-1|standing order' })
    const r = applyOverrides([a, b], [override({ key: 'card|acc-1|standing order|monthly', status: 'dismissed' })])
    expect(r.map(s => s.status)).toEqual([null, null])
  })

  it('prefers an exact match over a fallback', () => {
    const r = applyOverrides(
      [streamly],
      [override({ key: streamly.key + '|old', status: 'dismissed' }), override({ key: streamly.key, status: 'confirmed' })]
    )
    expect(r[0].status).toBe('confirmed')
  })

  it('ignores a blank display name', () => {
    const [s] = applyOverrides([streamly], [override({ key: streamly.key, displayName: '  ' })])
    expect(s.name).toBe('Streamly')
  })
})

describe('summarizeRecurring', () => {
  const all = applyOverrides(
    [
      streamly,
      gym,
      series({ key: 'card|acc-1|tvbox|monthly', name: 'TVBox', monthlyAmount: 60 }),
      series({ key: 'card|acc-1|sofaco|monthly', name: 'SofaCo', monthlyAmount: 250, isInstallment: true }),
      series({ key: 'bank|acc-2|card co|monthly', name: 'Card Co', source: 'bank', monthlyAmount: 900, isCardPayment: true }),
      series({ key: 'card|acc-1|ended|monthly', name: 'Ended', monthlyAmount: 70, active: false }),
    ],
    [override({ key: 'card|acc-1|tvbox|monthly', status: 'dismissed' })]
  )
  const sum = summarizeRecurring(all)

  it('splits series into sections', () => {
    expect(sum.subscriptions.map(s => s.name)).toEqual(['Streamly', 'GymCo'])
    expect(sum.installments.map(s => s.name)).toEqual(['SofaCo'])
    expect(sum.cardPayments.map(s => s.name)).toEqual(['Card Co'])
    expect(sum.inactive.map(s => s.name)).toEqual(['Ended'])
    expect(sum.dismissed.map(s => s.name)).toEqual(['TVBox'])
  })

  it('totals only active, kept subscriptions — never the card payment, installments or dismissed', () => {
    expect(sum.total).toBe(190)
    expect(sum.installmentsTotal).toBe(250)
  })

  it('exposes the matched transaction ids of every kept series', () => {
    const ids = recurringTransactionIds(all)
    expect(ids.has(streamly.transactionIds[0])).toBe(true)
    expect(ids.has('card|acc-1|sofaco|monthly:1')).toBe(true)
    expect(ids.has('card|acc-1|tvbox|monthly:1')).toBe(false)
  })
})
