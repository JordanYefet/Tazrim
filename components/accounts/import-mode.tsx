'use client'

import { useState } from 'react'
import { Columns3, Info, Lock } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { builtInLayoutFor } from '@/lib/import/builtin-layouts'
import { providerLabel } from '@/lib/accounts/brands'

/*
 * The "import" block of the account edit window. ENG-65: re-map columns with
 * a file. ENG-69: edit the saved mapping with no file, and for Leumi / Max
 * switch between the built-in importer and a custom mapping (and back).
 */

export interface ImportState {
  /** Leumi / Max: the account imports through its mapping instead of the built-in parser */
  customImport: boolean
  /** The account's own (linked) mapping */
  profile: { id: string; name: string } | null
}

const button =
  'inline-flex h-9 shrink-0 items-center rounded-lg border bg-card px-3 text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.97] disabled:opacity-50'
const quiet =
  'inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:opacity-50'

/** A little longer than the confirmation's exit animation */
const CONFIRM_EXIT_MS = 260

/** What the built-in importer handles that a mapping may not. */
export function BuiltInWarning({ lines }: { lines: string[] }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <ul className="min-w-0 space-y-1 text-xs text-muted-foreground text-pretty">
        {lines.map(l => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

export function ImportSection({
  account,
  state,
  onState,
  onEdit,
  onRemap,
}: {
  account: { id: string; kind: string; provider: string; displayName: string }
  state: ImportState
  onState: (next: ImportState) => void
  /** Open the saved mapping without a file */
  onEdit: (profileId: string) => void
  /** Re-map with a file (ENG-65) */
  onRemap: () => void
}) {
  const layout = builtInLayoutFor(account)
  const [asking, setAsking] = useState<'custom' | 'builtin' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const provider = providerLabel(account.provider)

  async function switchTo(mode: 'custom' | 'builtin') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/accounts/${account.id}/import-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setError(data.error ?? 'הפעולה נכשלה')
      setAsking(null)
      onState({ customImport: data.customImport, profile: data.profile })
      // straight into the seeded mapping, so it can be checked before the next upload; after the
      // confirmation has closed (unmounting it while open would close the edit window too)
      if (mode === 'custom' && data.profile) {
        const id = data.profile.id
        setTimeout(() => onEdit(id), CONFIRM_EXIT_MS)
      }
    } catch {
      setError('שגיאת רשת')
    } finally {
      setBusy(false)
    }
  }

  const builtInActive = layout && !state.customImport

  return (
    <div className="space-y-3 rounded-xl border p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        {builtInActive ? (
          <Lock className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <Columns3 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-sm font-medium">{builtInActive ? 'ייבוא מובנה' : layout ? 'מיפוי מותאם' : 'מיפוי עמודות'}</p>
          <p className="text-xs text-muted-foreground text-pretty">
            {builtInActive ? (
              <>האפליקציה קוראת לבד את קובצי {provider}. אפשר לעבור למיפוי עמודות משלך.</>
            ) : state.profile ? (
              <>
                הקבצים נקראים לפי המיפוי <bdi className="font-medium text-foreground">{state.profile.name}</bdi>. אפשר לערוך אותו בלי קובץ, או
                לבחור שוב קובץ ולייבא אותו מחדש.
              </>
            ) : (
              <>טעית בהתאמת העמודות? בחר שוב קובץ, תקן את המיפוי ואפשר לייבא אותו מחדש.</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {builtInActive ? (
            <button type="button" className={button} onClick={() => setAsking('custom')} disabled={busy}>
              מעבר למיפוי מותאם
            </button>
          ) : (
            <>
              {state.profile && (
                <button type="button" className={button} onClick={() => onEdit(state.profile!.id)}>
                  ערוך
                </button>
              )}
              <button type="button" className={button} onClick={onRemap}>
                מיפוי מחדש
              </button>
            </>
          )}
        </div>
      </div>

      {layout && state.customImport && (
        <>
          <BuiltInWarning lines={layout.warning} />
          <button type="button" className={`${quiet} -ms-1`} onClick={() => setAsking('builtin')} disabled={busy}>
            חזרה לייבוא המובנה
          </button>
        </>
      )}
      {error && !asking && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {layout && (
        // React events bubble through the portal: keep the confirmation's submit
        // away from the account form this block sits in
        <div className="contents" onSubmit={e => e.stopPropagation()}>
        <ConfirmDialog
          open={asking !== null}
          onOpenChange={o => !busy && !o && setAsking(null)}
          onConfirm={() => asking && switchTo(asking)}
          busy={busy}
          busyLabel="מעביר..."
          destructive={false}
          confirmLabel={asking === 'builtin' ? 'חזרה לייבוא המובנה' : 'מעבר למיפוי מותאם'}
          title={asking === 'builtin' ? `לחזור לייבוא המובנה של ${provider}?` : 'לעבור למיפוי מותאם?'}
          error={error}
          description={
            asking === 'builtin' ? (
              <p>הקבצים הבאים של {account.displayName} ייקראו שוב בייבוא המובנה. המיפוי נשמר, ואפשר לחזור אליו.</p>
            ) : (
              <>
                <p>
                  הקבצים הבאים של {account.displayName} ייקראו לפי מיפוי עמודות, שמתחיל מהמבנה המוכר של {provider}. תנועות שכבר יובאו לא
                  משתנות.
                </p>
                <BuiltInWarning lines={layout.warning} />
              </>
            )
          }
        />
        </div>
      )}
    </div>
  )
}
