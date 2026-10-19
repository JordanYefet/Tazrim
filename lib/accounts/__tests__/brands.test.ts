import { describe, expect, it } from 'vitest'
import { BANK_FACES, CARD_FACES, NEUTRAL_FACE, faceFor, impliedNetwork, isCardNetwork, networkLabel, providerKey } from '../brands'

describe('providerKey', () => {
  it('normalizes keys and maps Hebrew names', () => {
    expect(providerKey('  Leumi ')).toBe('leumi')
    expect(providerKey('ישראכרט')).toBe('isracard')
    expect(providerKey('בנק  הפועלים')).toBe('hapoalim')
    expect(providerKey('American Express')).toBe('amex')
    expect(providerKey(null)).toBe('')
  })
})

describe('faceFor', () => {
  it('uses the provider face of the right kind', () => {
    expect(faceFor('CREDIT_CARD', 'max')).toBe(CARD_FACES.max)
    expect(faceFor('BANK', 'discount')).toBe(BANK_FACES.discount)
    expect(faceFor('CREDIT_CARD', 'כאל')).toBe(CARD_FACES.cal)
  })

  it('does not give a bank a card face (or the other way round)', () => {
    expect(faceFor('BANK', 'max')).toBe(NEUTRAL_FACE)
    expect(faceFor('CREDIT_CARD', 'leumi')).toBe(NEUTRAL_FACE)
  })

  it('falls back to the account colour, then to graphite', () => {
    const face = faceFor('CREDIT_CARD', 'some issuer', 'var(--chart-5)')
    expect(face.key).toBe('color:var(--chart-5)')
    expect(face.stops.every(s => s.includes('var(--chart-5)'))).toBe(true)
    expect(faceFor('CREDIT_CARD', 'some issuer')).toBe(NEUTRAL_FACE)
    expect(faceFor('BANK', '')).toBe(NEUTRAL_FACE)
  })
})

describe('networks', () => {
  it('knows the four networks', () => {
    expect(['visa', 'mastercard', 'amex', 'diners'].every(isCardNetwork)).toBe(true)
    expect(isCardNetwork('VISA')).toBe(false)
    expect(isCardNetwork('other')).toBe(false)
    expect(networkLabel('mastercard')).toBe('Mastercard')
    expect(networkLabel(null)).toBeNull()
  })

  it('implies Amex for the Amex issuer only', () => {
    expect(impliedNetwork('amex')).toBe('amex')
    expect(impliedNetwork('max')).toBeNull()
  })
})
