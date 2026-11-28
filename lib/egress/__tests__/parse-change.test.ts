import { describe, expect, it } from 'vitest'
import { parseChange } from '../helper'

// Fake domains only (ENG-142: an addition may name the provider it is for)
describe('parseChange with a provider', () => {
  it('keeps a known provider on an addition and on a removal', () => {
    expect(parseChange({ action: 'add-domain', domain: 'cdn.example.test', note: 'x', provider: 'leumi' })).toEqual({ action: 'add-domain', domain: 'cdn.example.test', note: 'x', provider: 'leumi' })
    expect(parseChange({ action: 'remove-domain', domain: 'cdn.example.test', provider: 'visaCal' })).toEqual({ action: 'remove-domain', domain: 'cdn.example.test', provider: 'visaCal' })
  })
  it('no provider (or an empty one) means all of them, as before', () => {
    expect(parseChange({ action: 'add-domain', domain: 'cdn.example.test' })).toEqual({ action: 'add-domain', domain: 'cdn.example.test' })
    expect(parseChange({ action: 'add-domain', domain: 'cdn.example.test', provider: '' })).toEqual({ action: 'add-domain', domain: 'cdn.example.test' })
    expect(parseChange({ action: 'remove-domain', domain: 'cdn.example.test', provider: null })).toEqual({ action: 'remove-domain', domain: 'cdn.example.test' })
  })
  it('a provider that is not one the proxy knows (or not a string) refuses the whole change', () => {
    for (const provider of ['gamma', '__proto__', 'LEUMI', 7, ['leumi'], {}]) {
      expect(parseChange({ action: 'add-domain', domain: 'cdn.example.test', provider }), String(provider)).toBeNull()
      expect(parseChange({ action: 'remove-domain', domain: 'cdn.example.test', provider }), String(provider)).toBeNull()
    }
  })
})
