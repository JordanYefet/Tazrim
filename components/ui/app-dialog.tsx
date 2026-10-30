'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * The app's window (the account editor's, components/accounts/edit-account-dialog.tsx):
 * a sheet from the bottom on phones, a centred window on wider screens, rising in.
 * Every other window builds on this one, so they stay the same.
 */
export function AppDialog({
  open,
  onOpenChange,
  title,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          dir="rtl"
          aria-describedby={undefined}
          className={cn(
            'confirm-dialog fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl surface-overlay p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground focus:outline-none',
            // Centred without a transform, so the rise animation owns transform
            'sm:inset-x-4 sm:inset-y-0 sm:my-auto sm:h-fit sm:max-h-[88dvh] sm:max-w-lg sm:rounded-3xl sm:p-6',
            className
          )}
        >
          <Dialog.Close
            aria-label="סגור"
            className="absolute end-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </Dialog.Close>
          <Dialog.Title className="pe-10 text-lg font-semibold">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
