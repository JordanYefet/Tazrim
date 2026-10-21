'use client'

import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AccountForm, type CreatedAccount, type EditableAccount } from './add-account-form'
import { RemapColumns } from './remap-columns'
import { ImportSection, type ImportState } from './import-mode'
import { ProfileEditor } from '@/components/import/profile-editor'

export interface EditDialogAccount extends EditableAccount {
  /** The app reads this account's files with a built-in parser (not switched to a custom mapping) */
  builtInImport: boolean
  /** ENG-69: Leumi / Max switched to its own mapping */
  customImport: boolean
  /** The account's own saved mapping */
  importProfile: { id: string; name: string } | null
  /** The positional colour the brand default falls back to */
  positionColor?: string
}

/**
 * The edit window for a card or bank account (ENG-65): the add form in edit
 * mode, with the live element on top, plus the import block: re-map columns
 * with a file, edit the saved mapping without one (ENG-69), and for Leumi /
 * Max the switch between the built-in importer and a custom mapping. A sheet
 * from the bottom on phones, a centred window on wider screens.
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
  const [view, setView] = useState<'edit' | 'remap' | 'mapping'>('edit')
  const [editingProfile, setEditingProfile] = useState<string | null>(null)
  // Keep the last account while the window animates out
  const last = useRef(account)
  if (account) last.current = account
  const shown = last.current
  const isCard = shown?.kind === 'CREDIT_CARD'
  // The import mode as changed in this window (the page behind refreshes too)
  const [imports, setImports] = useState<{ id: string; state: ImportState } | null>(null)
  const importState: ImportState | null = shown
    ? imports?.id === shown.id
      ? imports.state
      : { customImport: shown.customImport, profile: shown.importProfile }
    : null

  function change(open: boolean) {
    if (!open) {
      setView('edit')
      setImports(null)
    }
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
            view !== 'edit' ? 'sm:max-w-4xl' : 'pb-0 sm:max-w-xl sm:pb-0 md:max-w-3xl'
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
                  {importState && (
                    <ImportSection
                      account={shown}
                      state={importState}
                      onState={state => {
                        setImports({ id: shown.id, state })
                        onImported()
                      }}
                      onEdit={id => {
                        setEditingProfile(id)
                        setView('mapping')
                      }}
                      onRemap={() => setView('remap')}
                    />
                  )}
                </AccountForm>
              ) : view === 'mapping' && editingProfile ? (
                <div className="space-y-4">
                  <Dialog.Title className="pe-10 text-base font-semibold">עריכת מיפוי: {shown.displayName}</Dialog.Title>
                  <button
                    type="button"
                    onClick={() => setView('edit')}
                    className="-ms-1 inline-flex items-center gap-0.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                    חזרה לעריכה
                  </button>
                  <ProfileEditor
                    key={editingProfile}
                    profileId={editingProfile}
                    onSaved={p => {
                      if (importState) setImports({ id: shown.id, state: { ...importState, profile: p } })
                      onImported()
                    }}
                    onCancel={() => setView('edit')}
                    cancelLabel="חזרה"
                    onNeedFile={() => setView('remap')}
                  />
                </div>
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
