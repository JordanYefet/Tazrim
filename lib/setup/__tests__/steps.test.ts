import { describe, expect, it } from 'vitest'
import { isSetupStep, nextStep, previousStep, resolveSetup, setupHref, stepNumber } from '../steps'

describe('setup steps', () => {
  it('goes forward one step at a time, past the passkey when it cannot work', () => {
    expect(nextStep('account')).toBe('recovery')
    expect(nextStep('recovery')).toBe('passkey')
    expect(nextStep('recovery', true)).toBe('basics')
    expect(nextStep('https')).toBe('done')
    expect(nextStep('done')).toBeNull()
  })

  it('never goes back to the account, the recovery code or a passkey step that cannot work', () => {
    expect(previousStep('account')).toBeNull()
    expect(previousStep('recovery')).toBeNull()
    expect(previousStep('passkey')).toBeNull()
    expect(previousStep('basics')).toBe('passkey')
    expect(previousStep('basics', true)).toBeNull()
    expect(previousStep('done')).toBe('https')
  })

  it('counts six steps, the recovery code inside the first', () => {
    expect(stepNumber('account')).toBe(1)
    expect(stepNumber('recovery')).toBe(1)
    expect(stepNumber('passkey')).toBe(2)
    expect(stepNumber('done')).toBe(6)
  })

  it('knows its steps', () => {
    expect(isSetupStep('phones')).toBe(true)
    expect(isSetupStep('nope')).toBe(false)
    expect(isSetupStep(undefined)).toBe(false)
    expect(setupHref('account')).toBe('/setup')
    expect(setupHref('https')).toBe('/setup?step=https')
  })
})

describe('resolveSetup', () => {
  const base = { hasPeople: true, signedIn: true, requested: null, saved: null }

  it('shows the account step while nobody has signed up, whatever the URL says', () => {
    expect(resolveSetup({ ...base, hasPeople: false, signedIn: false })).toEqual({ step: 'account' })
    expect(resolveSetup({ ...base, hasPeople: false, requested: 'basics' })).toEqual({ redirect: '/setup' })
  })

  it('sends a browser without a session to sign in once the household exists', () => {
    expect(resolveSetup({ ...base, signedIn: false, requested: 'basics' })).toEqual({ redirect: '/login' })
    expect(resolveSetup({ ...base, signedIn: false })).toEqual({ redirect: '/login' })
  })

  it('stays on the step in the URL (a reload)', () => {
    expect(resolveSetup({ ...base, requested: 'phones' })).toEqual({ step: 'phones' })
    expect(resolveSetup({ ...base, requested: 'done', saved: 'basics' })).toEqual({ step: 'done' })
  })

  it('never shows the account step again', () => {
    expect(resolveSetup({ ...base, requested: 'account' })).toEqual({ redirect: '/' })
    expect(resolveSetup({ ...base, requested: 'account', saved: 'https' })).toEqual({ redirect: '/setup?step=https' })
  })

  it('resumes a plain /setup where this browser left off, or goes to the overview', () => {
    expect(resolveSetup({ ...base, saved: 'basics' })).toEqual({ redirect: '/setup?step=basics' })
    expect(resolveSetup({ ...base, saved: 'done' })).toEqual({ redirect: '/' })
    expect(resolveSetup({ ...base, saved: 'junk' })).toEqual({ redirect: '/' })
    expect(resolveSetup(base)).toEqual({ redirect: '/' })
  })
})
