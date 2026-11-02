import { describe, expect, it } from 'vitest'
import { badgeCards, cardPaymentHref, monthOfDate } from '../payment-badge'
import { CARD_COLORS } from '@/lib/nav/state'

const account = (id: string, over: Partial<Parameters<typeof badgeCards>[0][number]> = {}) => ({
  id,
  kind: 'CREDIT_CARD',
  provider: 'max',
  archived: false,
  payerAccountId: null,
  displayName: `Card ${id}`,
  cardLastFour: '1111',
  cardNetwork: null,
  color: null,
  ...over,
})

describe('badgeCards', () => {
  it('keeps cards only, with the nav colours by position and archived cards after the active ones', () => {
    const cards = badgeCards([
      account('old', { archived: true }),
      account('bank', { kind: 'BANK' }),
      account('a'),
      account('b'),
    ])
    expect(cards.map(c => c.id)).toEqual(['a', 'b', 'old'])
    expect(cards.map(c => c.color)).toEqual([CARD_COLORS[0], CARD_COLORS[1], CARD_COLORS[2]])
    expect(cards[0]).toMatchObject({ name: 'Card a', lastFour: '1111', payerAccountId: null, colorChoice: null })
  })
})

describe('monthOfDate / cardPaymentHref', () => {
  it('reads a date key as written', () => {
    expect(monthOfDate('2026-01-31')).toEqual({ year: 2026, month: 1 })
  })

  it('reads a full date in local time', () => {
    expect(monthOfDate(new Date(2026, 9, 10, 0, 0))).toEqual({ year: 2026, month: 10 })
  })

  it("links to the card's page for the row's month", () => {
    expect(cardPaymentHref('acct max', '2026-10-10')).toBe('/cards/acct%20max?year=2026&month=10')
  })
})
