import { describe, expect, it, vi } from 'vitest'
import { createWalletViewStore, DEFAULT_WALLET_VIEW, WALLET_VIEWS } from '../wallet-view'

describe('wallet view', () => {
  it('starts on the transactions, which come first in the switch', () => {
    expect(DEFAULT_WALLET_VIEW).toBe('list')
    expect(WALLET_VIEWS.map(v => v.label)).toEqual(['תנועות', 'מגמות'])
    expect(createWalletViewStore().get()).toBe('list')
  })

  it('tells subscribers about a change, once, and not about the same view again', () => {
    const store = createWalletViewStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set('trends')
    store.set('trends')
    expect(store.get()).toBe('trends')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops telling a subscriber that left', () => {
    const store = createWalletViewStore()
    const listener = vi.fn()
    const leave = store.subscribe(listener)
    leave()
    store.set('trends')
    expect(listener).not.toHaveBeenCalled()
  })
})
