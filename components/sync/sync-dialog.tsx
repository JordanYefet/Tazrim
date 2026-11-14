'use client'

import type { CSSProperties } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils/cn'
import { useOpenOrigin } from '@/components/ui/open-origin'
import { SyncPanel } from './sync-panel'
import type { SyncApi } from './use-sync'

/**
 * The sync panel (ENG-91), opened from the profile card: a dropdown under the avatar on
 * wider screens (its start edge on the avatar's), a sheet above the tab bar on phones.
 * Controlled, so the card can close first and then open it.
 */
export function SyncDialog({
  open,
  onOpenChange,
  sync,
  anchorRect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sync: SyncApi
  anchorRect: DOMRect | null
}) {
  const origin = useOpenOrigin()
  const anchor = anchorRect
    ? ({ '--sync-right': `${window.innerWidth - anchorRect.right}px`, '--sync-top': `${anchorRect.bottom + 8}px` } as CSSProperties)
    : {}
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-scrim fixed inset-0 z-40 bg-black/45 md:bg-transparent" />
        <Dialog.Content
          ref={origin}
          dir="rtl"
          aria-describedby={undefined}
          style={anchor}
          className={cn(
            'sheet sync-panel fixed z-50 overflow-hidden surface-overlay text-card-foreground focus:outline-none',
            // Phones: above the tab bar
            'inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain rounded-3xl',
            // Wider: a dropdown under the avatar, at the header's start
            'md:inset-x-auto md:bottom-auto md:left-auto md:right-[var(--sync-right,1rem)] md:top-[var(--sync-top,3.75rem)] md:max-h-[calc(100dvh-5rem)] md:w-[22rem] md:rounded-2xl'
          )}
        >
          <Dialog.Title className="sr-only">סנכרון</Dialog.Title>
          <div aria-hidden className="flex justify-center pt-2 md:hidden">
            <span className="h-1 w-9 rounded-full bg-border" />
          </div>
          <SyncPanel sync={sync} onClose={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
