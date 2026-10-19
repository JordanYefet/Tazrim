'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils/cn'

const BUTTON =
  'inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-50'

export interface ConfirmOptions {
  title: ReactNode
  description?: ReactNode
  /** Defaults to "מחק" */
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button (the default); false for a neutral action */
  destructive?: boolean
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  busy?: boolean
  busyLabel?: string
  confirmDisabled?: boolean
  error?: string | null
  /** Extra fields between the description and the buttons (e.g. type-to-confirm) */
  children?: ReactNode
}

/**
 * The app's confirmation window: a compact card that rises from the bottom
 * on phones (above the tab bar) and sits centered on wider screens.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = 'מחק',
  cancelLabel = 'ביטול',
  destructive = true,
  busy = false,
  busyLabel,
  confirmDisabled = false,
  error,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          dir="rtl"
          className="confirm-dialog fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-3xl surface-overlay p-5 text-card-foreground focus:outline-none sm:inset-x-4 sm:top-0 sm:bottom-0 sm:my-auto sm:h-fit"
        >
          <form
            onSubmit={e => {
              e.preventDefault()
              if (!busy && !confirmDisabled) onConfirm()
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description asChild>
                  <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{description}</div>
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>

            {children}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Dialog.Close asChild>
                <button type="button" className={cn(BUTTON, 'bg-muted text-foreground hover:bg-muted/70')}>
                  {cancelLabel}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy || confirmDisabled}
                className={cn(
                  BUTTON,
                  destructive
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * window.confirm() replacement: `if (!(await confirm({ title }))) return`.
 * Render `dialog` once in the component.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false)
  // Kept after closing, so the text stays put during the exit animation
  const [options, setOptions] = useState<ConfirmOptions>({ title: '' })
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    resolver.current?.(false)
    setOptions(opts)
    setOpen(true)
    return new Promise<boolean>(resolve => {
      resolver.current = resolve
    })
  }, [])

  const settle = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOpen(false)
  }

  const dialog = (
    <ConfirmDialog {...options} open={open} onOpenChange={o => !o && settle(false)} onConfirm={() => settle(true)} />
  )

  return { confirm, dialog }
}
