'use client'

import { Columns3 } from 'lucide-react'

/*
 * The "import" block of the account edit window: every account's files are
 * read through a column mapping. ENG-65: re-map columns with a file. ENG-69:
 * edit the saved mapping with no file.
 */

export interface ImportState {
  /** The account's own (linked) mapping */
  profile: { id: string; name: string } | null
}

const button =
  'inline-flex h-9 shrink-0 items-center rounded-lg border bg-card px-3 text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.97] disabled:opacity-50'

export function ImportSection({
  state,
  onEdit,
  onRemap,
}: {
  state: ImportState
  /** Open the saved mapping without a file */
  onEdit: (profileId: string) => void
  /** Re-map with a file (ENG-65) */
  onRemap: () => void
}) {
  return (
    <div className="space-y-3 rounded-xl border p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Columns3 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-sm font-medium">מיפוי עמודות</p>
          <p className="text-xs text-muted-foreground text-pretty">
            {state.profile ? (
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
          {state.profile && (
            <button type="button" className={button} onClick={() => onEdit(state.profile!.id)}>
              ערוך
            </button>
          )}
          <button type="button" className={button} onClick={onRemap}>
            מיפוי מחדש
          </button>
        </div>
      </div>
    </div>
  )
}
