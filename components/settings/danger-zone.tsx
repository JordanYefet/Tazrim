'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { inputClass } from '@/components/accounts/add-account-form'
import { DELETE_ALL_PHRASE, matchesDeleteAllPhrase } from '@/lib/data/delete-all-phrase'

const BACKUP_DOCS = 'https://github.com/JordanYefet/Tazrim#גיבוי-ושחזור'

/** What the wipe removes: every data table in lib/db/wipe.ts, in the user's words. */
const DELETED = [
  'כל החשבונות וכרטיסי האשראי',
  'כל התנועות, עם ההערות והקטגוריות שעדכנת',
  'היסטוריית ההעלאות',
  'הקטגוריות',
  'כללי בתי העסק (שמות וקטגוריות)',
  'מיפויי הייבוא השמורים',
  'ההחלטות על חיובים קבועים',
  'התנועות שסימנת כלא חריגות',
]

/**
 * Settings → danger zone (ENG-62): deletes all data after the user types
 * DELETE_ALL_PHRASE. The server checks the phrase again and only accepts the
 * request from this machine. Afterwards the app reloads on the empty overview.
 */
export function DangerZone() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const matches = matchesDeleteAllPhrase(typed)

  function change(next: boolean) {
    if (deleting) return
    if (!next) {
      setTyped('')
      setError(null)
    }
    setOpen(next)
  }

  async function confirm() {
    if (!matches || deleting) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/data/delete-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'המחיקה נכשלה')
        setDeleting(false)
        return
      }
      // A full load, so no page keeps showing data from the client cache
      window.location.assign('/?deleted=1')
    } catch {
      setError('המחיקה נכשלה')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3 border-t border-destructive/25 pt-8">
      <div>
        <h2 id="danger-zone-title" className="text-lg font-semibold text-destructive dark:text-red-400">אזור מסוכן</h2>
        <p className="text-sm text-muted-foreground">פעולות שאי אפשר לבטל.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-xl surface border-destructive/40 p-4 md:p-6">
        <div className="min-w-0 max-w-md">
          <p className="text-sm font-medium">מחיקת כל הנתונים</p>
          <p className="text-sm text-muted-foreground text-pretty">
            מוחק את כל החשבונות, התנועות וההגדרות, והאפליקציה חוזרת למצב של התקנה חדשה.
          </p>
        </div>
        <button
          type="button"
          onClick={() => change(true)}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-destructive px-5 text-sm font-bold text-destructive-foreground shadow-[var(--elevation-1)] transition-[background-color,transform] duration-quick ease-out hover:bg-destructive/90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          מחיקת כל הנתונים
        </button>
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={change}
        onConfirm={confirm}
        title="למחוק את כל הנתונים?"
        description={
          <>
            <p>יימחקו מהמחשב הזה:</p>
            <ul className="list-disc space-y-0.5 ps-5">
              {DELETED.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="font-medium text-foreground">אי אפשר לבטל את הפעולה.</p>
            <p>
              כדאי לגבות קודם את קובץ הנתונים:{' '}
              <a
                href={BACKUP_DOCS}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                הוראות גיבוי
              </a>
            </p>
          </>
        }
        confirmLabel="מחיקה לצמיתות"
        busy={deleting}
        busyLabel="מוחק…"
        confirmDisabled={!matches}
        error={error}
      >
        <div className="space-y-1.5">
          <label htmlFor="delete-all-confirm" className="text-sm font-medium">
            כדי לאשר, הקלידו: <bdi className="font-semibold">{DELETE_ALL_PHRASE}</bdi>
          </label>
          <input
            id="delete-all-confirm"
            className={inputClass}
            value={typed}
            onChange={e => setTyped(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={deleting}
            autoFocus
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}
