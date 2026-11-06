import { describe, expect, it } from 'vitest'
import { AccountValidationError, normalizeProvider } from '../accounts'

// ENG-102: an account's provider is its company's key. Made-up names only.

describe('normalizeProvider', () => {
  it('maps a company\'s other names and club brands to its key', () => {
    expect(normalizeProvider('כאל', 'CREDIT_CARD')).toBe('cal')
    expect(normalizeProvider('  HiTech ', 'CREDIT_CARD')).toBe('cal')
    expect(normalizeProvider('בנק  יהב', 'BANK')).toBe('yahav')
    expect(normalizeProvider('בנק פאג"י', 'BANK')).toBe('pagi')
  })

  it('keeps a name the sync does not know: an upload-only provider', () => {
    expect(normalizeProvider('Fake Issuer', 'CREDIT_CARD')).toBe('fake issuer')
  })

  it('refuses a company of the other kind', () => {
    expect(() => normalizeProvider('max', 'BANK')).toThrow(AccountValidationError)
    expect(() => normalizeProvider('לאומי', 'CREDIT_CARD')).toThrow(/בנק/)
  })
})
