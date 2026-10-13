import { describe, expect, it } from 'vitest'
import { isCardPaymentDescription } from '@/lib/insights/card-payment'

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
