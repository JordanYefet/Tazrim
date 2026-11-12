'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { SegmentedTrack } from '@/components/ui/segmented'
import { DEFAULT_WALLET_VIEW, WALLET_VIEWS, walletView } from '@/lib/nav/wallet-view'

/**
 * Phones: under the wallet, "תנועות / מגמות" (lib/nav/wallet-view.ts). תנועות
 * shows the transactions; מגמות the figures beside the wallet and the charts.
 * Wraps the page's __beside and __rest blocks (display: contents, so they stay
 * grid items of .wallet-shell); the parts mark themselves `data-view="list"` or
 * `data-view="trends"` and app/globals.css hides the other view below lg.
 * Desktop shows everything, as before. With nothing to chart (`enabled` false)
 * there is no switch and everything shows.
 */
export function WalletViews({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
  const view = useSyncExternalStore(walletView.subscribe, walletView.get, () => DEFAULT_WALLET_VIEW)
  if (!enabled) return <>{children}</>
  return (
    <div className="contents" data-wallet-view={view}>
      <div className="wallet-shell__switch lg:hidden">
        <SegmentedTrack
          role="group"
          aria-label="תצוגה"
          active={view}
          thumbClassName="rounded-[9px] bg-card shadow-sm"
          className="grid h-11 auto-cols-fr grid-flow-col rounded-xl bg-muted p-[3px]"
        >
          {WALLET_VIEWS.map(v => {
            const on = v.key === view
            return (
              <button
                key={v.key}
                type="button"
                data-segment={v.key}
                data-on={on || undefined}
                aria-pressed={on}
                onClick={() => walletView.set(v.key)}
                className={cn(
                  'flex items-center justify-center rounded-[9px] text-[15px] transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground'
                )}
              >
                {v.label}
              </button>
            )
          })}
        </SegmentedTrack>
      </div>
      {children}
    </div>
  )
}
