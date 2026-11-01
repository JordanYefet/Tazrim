import { describe, expect, it } from 'vitest'
import { dayMonth, pickCardPaymentRow, type PaymentRowCandidate } from '../card-payment-row'
import type { PayerCard } from '../card-payer'

// Made-up descriptions, amounts and dates only.
const card = (id: string, provider: string, payerAccountId: string | null = null): PayerCard => ({
  id,
  provider,
  archived: false,
  payerAccountId,
})

const row = (id: string, accountId: string, date: string, description: string, debit: number): PaymentRowCandidate => ({
  id,
  accountId,
  date,
  descriptions: [description, null],
  debit,
})

describe('pickCardPaymentRow', () => {
  it('picks the row that pays this card, not another company', () => {
    const cards = [card('max1', 'max', 'bankA'), card('cal1', 'cal', 'bankA')]
    const rows = [row('r1', 'bankA', '2026-03-02', 'כאל תשלום', 900), row('r2', 'bankA', '2026-03-10', 'מקס איט פיננסים', 500)]
    expect(pickCardPaymentRow(rows, 'max1', cards, 900)?.id).toBe('r2')
  })

  it('ignores rows of another bank when the card is linked', () => {
    const cards = [card('max1', 'max', 'bankA')]
    const rows = [row('r1', 'bankB', '2026-03-10', 'מקס איט פיננסים', 500)]
    expect(pickCardPaymentRow(rows, 'max1', cards, 500)).toBeNull()
  })

  it('finds an unlinked card in any bank', () => {
    const cards = [card('max1', 'max')]
    const rows = [row('r1', 'bankB', '2026-03-10', 'מקס איט פיננסים', 500)]
    expect(pickCardPaymentRow(rows, 'max1', cards, 0)?.id).toBe('r1')
  })

  it('prefers the amount closest to the charges, then the latest date', () => {
    const cards = [card('max1', 'max', 'bankA')]
    const rows = [
      row('r1', 'bankA', '2026-03-02', 'מקס איט', 120),
      row('r2', 'bankA', '2026-03-10', 'מקס איט', 1010),
      row('r3', 'bankA', '2026-03-05', 'מקס איט', 990),
    ]
    expect(pickCardPaymentRow(rows, 'max1', cards, 1000)?.id).toBe('r2')
    expect(pickCardPaymentRow(rows, 'max1', cards, 125)?.id).toBe('r1')
  })

  it('returns null for no rows or generic descriptions', () => {
    const cards = [card('cal1', 'cal')]
    expect(pickCardPaymentRow([], 'cal1', cards, 100)).toBeNull()
    expect(pickCardPaymentRow([row('r1', 'bankA', '2026-03-02', 'כרטיס אשראי', 100)], 'cal1', cards, 100)).toBeNull()
  })
})

describe('dayMonth', () => {
  it('formats a date key as DD.MM', () => {
    expect(dayMonth('2026-03-07')).toBe('07.03')
  })
})
