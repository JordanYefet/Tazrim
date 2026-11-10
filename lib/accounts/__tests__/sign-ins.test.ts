import { describe, expect, it } from 'vitest'
import { matchSignIns, type LinkRow, type SignInRow } from '../sign-ins'

const signIn = (id: string, company: string, accountId: string | null = null): SignInRow => ({
  id,
  company,
  label: company,
  accountId,
  updatedAt: '2026-01-02T10:00:00.000Z',
})
const link = (company: string, accountId: string | null, lastSyncedAt: string | null = null, ignored = false): LinkRow => ({
  company,
  accountId,
  ignored,
  lastSyncedAt,
})

describe('matchSignIns', () => {
  it('covers the account the sign-in names', () => {
    const m = matchSignIns([signIn('s1', 'leumi', 'a1')], [])
    expect(m.get('a1')?.credentialId).toBe('s1')
    expect(m.get('a1')?.accountIds).toEqual(['a1'])
  })

  it("a company's only sign-in covers every linked account, with the newest sync", () => {
    const m = matchSignIns(
      [signIn('s1', 'max', 'c1')],
      [link('max', 'c1', '2026-01-01T08:00:00.000Z'), link('max', 'c2', '2026-01-03T08:00:00.000Z')]
    )
    expect(m.get('c1')?.accountIds).toEqual(['c1', 'c2'])
    expect(m.get('c2')?.credentialId).toBe('s1')
    expect(m.get('c2')?.lastSyncedAt).toBe('2026-01-03T08:00:00.000Z')
  })

  it('leaves out ignored links and other companies', () => {
    const m = matchSignIns([signIn('s1', 'max')], [link('max', null, null, true), link('max', 'c3', null, true), link('visaCal', 'c9')])
    expect(m.size).toBe(0)
  })

  it('two sign-ins for one company each cover only the account they name', () => {
    const m = matchSignIns([signIn('s1', 'max', 'c1'), signIn('s2', 'max', 'c2')], [link('max', 'c1'), link('max', 'c2'), link('max', 'c3')])
    expect(m.get('c1')?.credentialId).toBe('s1')
    expect(m.get('c2')?.credentialId).toBe('s2')
    expect(m.has('c3')).toBe(false)
  })

  it('the first saved sign-in wins an account two name', () => {
    const m = matchSignIns([signIn('s1', 'max', 'c1'), signIn('s2', 'max', 'c1')], [])
    expect(m.get('c1')?.credentialId).toBe('s1')
  })
})
