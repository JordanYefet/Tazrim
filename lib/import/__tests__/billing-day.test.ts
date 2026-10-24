import { describe, expect, it } from 'vitest'
import { billingDateByDay } from '../billing-day'

// Made-up dates.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)
const bill = (purchase: Date, day: number, closesOn?: number, notes = '') => billingDateByDay(purchase, { day, closesOn }, notes)

describe('billingDateByDay: billed every month on one day', () => {
  it('a purchase before the billing day is billed that month', () => {
    expect(bill(d(2030, 10, 8), 10)).toEqual(d(2030, 10, 10))
    expect(bill(d(2029, 7, 4), 10)).toEqual(d(2029, 7, 10))
  })

  it('a purchase on the billing day is billed that day', () => {
    expect(bill(d(2030, 10, 10), 10)).toEqual(d(2030, 10, 10))
  })

  it('a purchase after the billing day is billed the next month, across the year end too', () => {
    expect(bill(d(2030, 10, 15), 10)).toEqual(d(2030, 11, 10))
    expect(bill(d(2030, 12, 20), 10)).toEqual(d(2031, 1, 10))
  })

  it('the 31st is the last day of a shorter month', () => {
    expect(bill(d(2030, 2, 10), 31)).toEqual(d(2030, 2, 28))
    expect(bill(d(2032, 2, 10), 31)).toEqual(d(2032, 2, 29))
    expect(bill(d(2030, 4, 30), 31)).toEqual(d(2030, 4, 30))
  })
})

describe('billingDateByDay: the cycle closes before the billing day', () => {
  // billed on the 10th, the cycle closes on the 7th
  it('a purchase up to the closing day is on this month’s bill', () => {
    expect(bill(d(2030, 10, 7), 10, 7)).toEqual(d(2030, 10, 10))
    expect(bill(d(2030, 10, 1), 10, 7)).toEqual(d(2030, 10, 10))
  })

  it('a purchase after the closing day waits for next month’s bill, even before the billing day', () => {
    expect(bill(d(2030, 10, 8), 10, 7)).toEqual(d(2030, 11, 10))
    expect(bill(d(2030, 10, 25), 10, 7)).toEqual(d(2030, 11, 10))
  })
})

describe('billingDateByDay: the cycle closes after the billing day (billed early in the next month)', () => {
  // billed on the 2nd, the cycle closes on the 28th
  it('a purchase up to the 28th is billed on the 2nd of the next month', () => {
    expect(bill(d(2030, 10, 15), 2, 28)).toEqual(d(2030, 11, 2))
    expect(bill(d(2030, 10, 28), 2, 28)).toEqual(d(2030, 11, 2))
  })

  it('a later purchase moves one more month', () => {
    expect(bill(d(2030, 10, 29), 2, 28)).toEqual(d(2030, 12, 2))
  })
})

describe('billingDateByDay: instalments', () => {
  it('payment N of M is billed N - 1 months after the first payment', () => {
    // bought 5/10, first payment on 10/10
    expect(bill(d(2030, 10, 5), 10, undefined, 'תשלום 1 מתוך 3')).toEqual(d(2030, 10, 10))
    expect(bill(d(2030, 10, 5), 10, undefined, 'תשלום 3 מתוך 3')).toEqual(d(2030, 12, 10))
    expect(bill(d(2030, 11, 20), 10, 7, 'תשלום 2 מתוך 10')).toEqual(d(2031, 1, 10))
  })

  it('keeps the billing day in a shorter month', () => {
    expect(bill(d(2030, 1, 5), 31, undefined, 'תשלום 2 מתוך 3')).toEqual(d(2030, 2, 28))
  })
})
