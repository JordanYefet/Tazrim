import { describe, expect, it } from 'vitest'
import { cardPaymentProvider, isCardPaymentDescription, mayBeCardPayment } from '@/lib/insights/card-payment'

describe('isCardPaymentDescription', () => {
  it.each([
    'מקס איט פיננסים',
    'כרטיסי אשראי',
    'חיוב כרטיס אשראי',
    'ישראכרט בע"מ',
    'כאל',
    'ויזה-כאל',
    'MAX IT',
    'Max',
    'AMEX',
    'American Express',
  ])('matches card-company debit %s', d => {
    expect(isCardPaymentDescription(d)).toBe(true)
  })

  it.each(['מקסימום ספורט', 'Maxwell Books', 'קפה כאלה', 'Fake Cafe', 'משכורת'])(
    'does not match ordinary description %s',
    d => {
      expect(isCardPaymentDescription(d)).toBe(false)
    }
  )
})

describe('cardPaymentProvider', () => {
  it.each([
    ['מקס איט פיננסים', 'max'],
    ['MAX IT', 'max'],
    ['לאומי קארד', 'max'],
    ['ויזה-כאל', 'cal'],
    ['כאל', 'cal'],
    ['כרטיסי אשראי לישראל', 'cal'],
    ['ישראכרט בע"מ', 'isracard'],
    ['Isracard', 'isracard'],
    ['אמריקן אקספרס', 'amex'],
    ['AMEX', 'amex'],
    ['דיינרס', 'diners'],
  ])('maps %s to %s', (d, provider) => {
    expect(cardPaymentProvider(d)).toBe(provider)
    // the SQL prefilter must let every mapped description through
    expect(mayBeCardPayment(d)).toBe(true)
  })

  it.each(['מקסימום ספורט', 'Maxwell Books', 'קפה כאלה', 'Fake Cafe', 'חיוב כרטיס אשראי'])(
    'gives no provider for %s',
    d => {
      expect(cardPaymentProvider(d)).toBeNull()
    }
  )

  it('every provider match is also a card payment', () => {
    for (const d of ['מקס איט', 'ויזה כאל', 'ישראכרט', 'American Express', 'Diners', 'לאומי קארד']) {
      expect(isCardPaymentDescription(d)).toBe(true)
    }
  })
})
