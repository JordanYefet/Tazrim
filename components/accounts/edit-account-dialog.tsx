'use client'

import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Archive, ArchiveRestore, ChevronRight, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AccountForm, type CreatedAccount, type EditableAccount } from './add-account-form'
import { RemapColumns } from './remap-columns'
import { ImportSection, type ImportState } from './import-section'
import { ProfileEditor } from '@/components/import/profile-editor'

export interface EditDialogAccount extends EditableAccount {
  /** The account's own saved mapping */
  importProfile: { id: string; name: string } | null
  /** The positional colour the brand default falls back to */
  positionColor?: string
}

/**
 * The edit window for a card or bank account (ENG-65): the add form in edit
 * mode, with the live element on top, plus the import block: re-map columns
 * with a file, or edit the saved mapping without one (ENG-69). A sheet from
 * the bottom on phones, a centred window on wider screens.
 */
export interface AccountManage {
  archived: boolean
  /** The last account of its kind can't be deleted */
  lastOfKind: boolean
  onArchiveToggle: () => Promise<void>
  onDelete: () => void
}

export function EditAccountDialog({
  account,
  onOpenChange,
  onSaved,
  onImported,
  manage,
}: {
  account: EditDialogAccount | null
  onOpenChange: (open: boolean) => void
  onSaved: (account: CreatedAccount) => void
  /** A re-import changed rows */
  onImported: () => void
  /** Archive (or restore) and delete, at the end of the edit view (/settings: the row has no buttons of its own) */
  manage?: AccountManage
}) {
  const [view, setView] = useState<'edit' | 'remap' | 'mapping'>('edit')
  const [editingProfile, setEditingProfile] = useState<string | null>(null)
  // Keep the last account while the window animates out
  const last = useRef(account)
  if (account) last.current = account
  const shown = last.current
  const isCard = shown?.kind === 'CREDIT_CARD'
  // The saved mapping as changed in this window (the page behind refreshes too)
  const [imports, setImports] = useState<{ id: string; state: ImportState } | null>(null)
  const importState: ImportState | null = shown
    ? imports?.id === shown.id
      ? imports.state
      : { profile: shown.importProfile }
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
                      state={importState}
                      onEdit={id => {
                        setEditingProfile(id)
                        setView('mapping')
                      }}
                      onRemap={() => setView('remap')}
                    />
                  )}
                  {manage && <ManageSection manage={manage} />}
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

/** Archive (or restore) and delete, as labelled rows at the end of the edit view */
function ManageSection({ manage }: { manage: AccountManage }) {
  const [busy, setBusy] = useState(false)
  return (
    <ul className="overflow-hidden rounded-xl bg-muted/40 divide-y divide-border/60" aria-busy={busy}>
      <li>
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await manage.onArchiveToggle() } finally { setBusy(false) } }}
          className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-start transition-colors hover:bg-muted disabled:opacity-60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
            {manage.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px]">{manage.archived ? 'שחזור מהארכיון' : 'העברה לארכיון'}</span>
            <span className="block text-xs text-muted-foreground">
              {manage.archived ? 'יחזור להופיע בהעלאת קבצים ובסיכומים' : 'לא יופיע בהעלאת קבצים ובסיכומים; הנתונים נשמרים'}
            </span>
          </span>
        </button>
      </li>
      <li>
        <button
          type="button"
          disabled={busy || manage.lastOfKind}
          onClick={manage.onDelete}
          className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-start transition-colors hover:bg-muted disabled:opacity-50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive" aria-hidden>
            <Trash2 className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] text-destructive">מחיקת החשבון</span>
            <span className="block text-xs text-muted-foreground">
              {manage.lastOfKind ? 'אי אפשר למחוק את החשבון האחרון מסוגו' : 'מוחק גם את כל התנועות שלו'}
            </span>
          </span>
        </button>
      </li>
    </ul>
  )
}
