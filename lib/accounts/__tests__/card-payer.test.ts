import { describe, expect, it } from 'vitest'
import { cardsForPayment, type PayerCard } from '../card-payer'

const card = (id: string, provider: string, payerAccountId: string | null = null, archived = false): PayerCard => ({
  id,
  provider,
  archived,
  payerAccountId,
})

describe('cardsForPayment', () => {
  it('finds the card linked to this bank by the company in the description', () => {
    const cards = [card('max1', 'max', 'bankA'), card('cal1', 'cal', 'bankA')]
    expect(cardsForPayment(['מקס איט פיננסים'], 'bankA', cards).map(c => c.id)).toEqual(['max1'])
  })

  it('prefers linked cards over unlinked ones of the same company', () => {
    const cards = [card('max1', 'max', 'bankA'), card('max2', 'max')]
    expect(cardsForPayment(['מקס איט פיננסים'], 'bankA', cards).map(c => c.id)).toEqual(['max1'])
  })

  it('falls back to unlinked cards, and never to a card another bank pays', () => {
    const cards = [card('max1', 'max', 'bankB'), card('max2', 'max')]
    expect(cardsForPayment(['מקס איט פיננסים'], 'bankA', cards).map(c => c.id)).toEqual(['max2'])
    expect(cardsForPayment(['מקס איט פיננסים'], 'bankA', [card('max1', 'max', 'bankB')])).toEqual([])
  })

  it('returns every linked card of the company (one debit for two cards)', () => {
    const cards = [card('max1', 'max', 'bankA'), card('max2', 'max', 'bankA', true)]
    expect(cardsForPayment(['מקס איט פיננסים'], 'bankA', cards).map(c => c.id)).toEqual(['max1', 'max2'])
  })

  it('tries each description in turn, and gives nothing for a generic one', () => {
    const cards = [card('cal1', 'cal')]
    expect(cardsForPayment([null, 'כרטיסי אשראי לישראל'], 'bankA', cards).map(c => c.id)).toEqual(['cal1'])
    expect(cardsForPayment(['כרטיס אשראי'], 'bankA', cards)).toEqual([])
  })
})
