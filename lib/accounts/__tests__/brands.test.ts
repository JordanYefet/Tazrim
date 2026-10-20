import { describe, expect, it } from 'vitest'
import {
  BANK_FACES,
  CARD_FACES,
  CARD_NEUTRAL_FACE,
  NEUTRAL_FACE,
  faceFor,
  impliedNetwork,
  isCardNetwork,
  isKnownIssuer,
  issuerWordmark,
  networkLabel,
  providerKey,
} from '../brands'

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
    expect(faceFor('CREDIT_CARD', 'leumi')).toBe(CARD_NEUTRAL_FACE)
  })

  it('falls back to the account colour, then to graphite', () => {
    const face = faceFor('CREDIT_CARD', 'some issuer', 'var(--chart-5)')
    expect(face.key).toBe('color:var(--chart-5)')
    expect(face.stops.every(s => s.includes('var(--chart-5)'))).toBe(true)
    expect(faceFor('CREDIT_CARD', 'some issuer')).toBe(CARD_NEUTRAL_FACE)
    expect(faceFor('BANK', 'some bank', 'var(--chart-5)').key).toBe('color:var(--chart-5)')
    expect(faceFor('BANK', '')).toBe(NEUTRAL_FACE)
  })
})

describe('networks', () => {
  it('knows the five networks', () => {
    expect(['visa', 'mastercard', 'amex', 'diners', 'isracard'].every(isCardNetwork)).toBe(true)
    expect(isCardNetwork('VISA')).toBe(false)
    expect(isCardNetwork('other')).toBe(false)
    expect(networkLabel('mastercard')).toBe('Mastercard')
    expect(networkLabel('isracard')).toBe('Isracard')
    expect(networkLabel(null)).toBeNull()
  })

  it('implies Amex for the Amex issuer only', () => {
    expect(impliedNetwork('amex')).toBe('amex')
    expect(impliedNetwork('max')).toBeNull()
  })
})

describe('issuerWordmark', () => {
  it('typesets known issuers and falls back to the provider label', () => {
    expect(issuerWordmark('max')).toBe('max')
    expect(issuerWordmark('ישראכרט')).toBe('isracard')
    expect(issuerWordmark('hitech')).toBe('הייטקזון')
    expect(issuerWordmark('some issuer')).toBe('some issuer')
    expect(issuerWordmark('')).toBe('')
    expect(isKnownIssuer('Cal')).toBe(true)
    expect(isKnownIssuer('hitech')).toBe(false)
  })
})
