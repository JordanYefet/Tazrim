'use client'

import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Columns3, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AccountForm, type CreatedAccount, type EditableAccount } from './add-account-form'
import { RemapColumns } from './remap-columns'

export interface EditDialogAccount extends EditableAccount {
  /** The app reads this provider's files itself, so there is no mapping to fix */
  builtInImport: boolean
  /** The positional colour the brand default falls back to */
  positionColor?: string
}

/**
 * The edit window for a card or bank account (ENG-65): the add form in edit
 * mode, with the live element on top, plus "re-map columns" for accounts
 * imported through a saved mapping. A sheet from the bottom on phones, a
 * centred window on wider screens.
 */
export function EditAccountDialog({
  account,
  onOpenChange,
  onSaved,
  onImported,
}: {
  account: EditDialogAccount | null
  onOpenChange: (open: boolean) => void
  onSaved: (account: CreatedAccount) => void
  /** A re-import changed rows */
  onImported: () => void
}) {
  const [view, setView] = useState<'edit' | 'remap'>('edit')
  // Keep the last account while the window animates out
  const last = useRef(account)
  if (account) last.current = account
  const shown = last.current
  const isCard = shown?.kind === 'CREDIT_CARD'

  function change(open: boolean) {
    if (!open) setView('edit')
    onOpenChange(open)
  }

  return (
    <Dialog.Root open={!!account} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          dir="rtl"
          aria-describedby={undefined}
          className={cn(
            'confirm-dialog fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl surface-overlay p-5 text-card-foreground focus:outline-none',
            // Centred without a transform, so the rise animation owns transform
            'sm:inset-x-4 sm:inset-y-0 sm:my-auto sm:h-fit sm:max-h-[88dvh] sm:rounded-3xl sm:p-6',
            view === 'remap' ? 'sm:max-w-4xl' : 'pb-0 sm:max-w-xl sm:pb-0 md:max-w-3xl'
          )}
        >
          {shown && (
            <>
              <Dialog.Close
                aria-label="סגור"
                className="absolute end-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </Dialog.Close>
              {view === 'edit' ? (
                <AccountForm
                  key={shown.id}
                  mode="edit"
                  account={shown}
                  fallbackColor={shown.positionColor}
                  onSaved={onSaved}
                  onCancel={() => change(false)}
                  heading={
                    <Dialog.Title className="pe-10 text-base font-semibold">
                      {isCard ? 'עריכת כרטיס' : 'עריכת חשבון בנק'}
                    </Dialog.Title>
                  }
                >
                  {!shown.builtInImport && (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3.5">
                      <Columns3 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">מיפוי עמודות</p>
                        <p className="text-xs text-muted-foreground text-pretty">
                          טעית בהתאמת העמודות? בחר שוב קובץ, תקן את המיפוי ואפשר לייבא אותו מחדש.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setView('remap')}
                        className="inline-flex h-9 shrink-0 items-center rounded-lg border bg-card px-3 text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.97]"
                      >
                        מיפוי מחדש
                      </button>
                    </div>
                  )}
                </AccountForm>
              ) : (
                <div className="space-y-4">
                  <Dialog.Title className="pe-10 text-base font-semibold">מיפוי עמודות מחדש: {shown.displayName}</Dialog.Title>
                  <RemapColumns
                    account={{ id: shown.id, kind: shown.kind, provider: shown.provider, displayName: shown.displayName }}
                    onBack={() => setView('edit')}
                    onImported={onImported}
                  />
                </div>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
