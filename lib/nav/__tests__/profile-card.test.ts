import { describe, expect, it } from 'vitest'
import { avatarMark, profileRows } from '../profile-card'

describe('avatarMark', () => {
  it('maps each tone to its mark', () => {
    expect(avatarMark('idle', false)).toBe('none')
    expect(avatarMark('busy', false)).toBe('ring')
    expect(avatarMark('done', false)).toBe('done')
    expect(avatarMark('failed', false)).toBe('failed')
  })

  it('tells a waiting code from other attention', () => {
    expect(avatarMark('attention', true)).toBe('code')
    expect(avatarMark('attention', false)).toBe('alert')
  })
})

describe('profileRows', () => {
  it('shows everything for a signed-in person', () => {
    expect(profileRows(true)).toEqual(['who', 'sync', 'upload', 'settings', 'signout'])
  })

  it('drops the person rows with the login off', () => {
    expect(profileRows(false)).toEqual(['sync', 'upload', 'settings'])
  })
})
