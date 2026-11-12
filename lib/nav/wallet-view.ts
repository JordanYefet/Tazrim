/**
 * The phone's view under the wallet on /cards, /banks and an account's page:
 * the transactions ('list') or the figures and charts ('trends'). Kept in
 * memory, so it holds while you move between the stack and an account's page;
 * a fresh load starts on the transactions (as the server renders it).
 */

export type WalletView = 'list' | 'trends'

export const WALLET_VIEWS: { key: WalletView; label: string }[] = [
  { key: 'list', label: 'תנועות' },
  { key: 'trends', label: 'מגמות' },
]

export const DEFAULT_WALLET_VIEW: WalletView = 'list'

export function createWalletViewStore(initial: WalletView = DEFAULT_WALLET_VIEW) {
  let view = initial
  const listeners = new Set<() => void>()
  return {
    get: () => view,
    set(next: WalletView) {
      if (next === view) return
      view = next
      listeners.forEach(l => l())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** The one the pages share */
export const walletView = createWalletViewStore()
