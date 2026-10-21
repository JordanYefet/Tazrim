'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Columns3, Lock, Pencil, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { providerLabel } from '@/components/upload/account-picker'
import type { ProfileView } from '@/lib/import/profile-view'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ProfileEditDialog } from './profile-edit-dialog'

const BUILT_IN = [
  { key: 'leumi', name: 'לאומי – תנועות בחשבון', kind: 'חשבון בנק' },
  { key: 'max', name: 'מקס – פירוט עסקאות', kind: 'כרטיס אשראי' },
]

const iconButton =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-quick ease-out hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'

const kindLabel = (k: ProfileView['accountKind']) => (k === 'BANK' ? 'חשבון בנק' : k === 'CREDIT_CARD' ? 'כרטיס אשראי' : k)

/**
 * Saved column mappings (ENG-24): edit (ENG-69, from the stored header, no
 * file), rename or delete. The built-in importers are listed for reference; a
 * Leumi or Max account switches to its own mapping from its edit window.
 */
export function ImportProfilesManager({ profiles }: { profiles: ProfileView[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<ProfileView | null>(null)
  // The last profile asked about, so the text stays put while the dialog animates out
  const asked = useRef<ProfileView | null>(null)
  if (confirming) asked.current = confirming
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  const [mapping, setMapping] = useState<ProfileView | null>(null)

  async function call(id: string, init: RequestInit) {
    setPending(id)
    setError(null)
    try {
      const res = await fetch(`/api/import-profiles/${id}`, init)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError({ id, message: data.error ?? 'הפעולה נכשלה' })
        return false
      }
      router.refresh()
      return true
    } catch {
      setError({ id, message: 'שגיאת רשת' })
      return false
    } finally {
      setPending(null)
    }
  }

  async function rename(e: React.FormEvent, id: string) {
    e.preventDefault()
    const ok = await call(id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draft }),
    })
    if (ok) setEditing(null)
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 id="import-profiles-title" className="text-lg font-semibold">מיפויי ייבוא</h2>
        <p className="text-sm text-muted-foreground">
          מיפויי עמודות שנשמרו בהעלאת קבצים. קובץ עם אותן כותרות מזוהה לבד, ואפשר לערוך מיפוי גם בלי קובץ.
        </p>
      </div>
      <ul className="divide-y rounded-xl surface">
        {profiles.map(p => (
          <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-2 px-4 py-3 md:px-6">
            {editing === p.id ? (
              <form onSubmit={e => rename(e, p.id)} className="flex min-w-0 flex-1 items-center gap-1">
                <label htmlFor={`profile-${p.id}`} className="sr-only">שם המיפוי</label>
                <input
                  id={`profile-${p.id}`}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && setEditing(null)}
                  maxLength={80}
                  autoFocus
                  className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button type="submit" className={iconButton} aria-label="שמור שם" disabled={pending === p.id || !draft.trim()}>
                  <Check className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" className={iconButton} aria-label="בטל עריכה" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </form>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {providerLabel(p.provider)} · {kindLabel(p.accountKind)}
                  {p.account && <> · ברירת מחדל של {p.account.displayName}</>}
                </p>
                {p.idle && <p className="text-xs text-muted-foreground text-pretty">לא בשימוש כרגע, החשבון מיובא בייבוא המובנה</p>}
              </div>
            )}
            {editing !== p.id && (
              <div className="flex items-center">
                {p.fileless && (
                  <button
                    type="button"
                    onClick={() => setMapping(p)}
                    aria-label={`ערוך את המיפוי: ${p.name}`}
                    className="me-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium transition-[background-color,transform] duration-quick ease-out hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Columns3 className="h-4 w-4 text-muted-foreground" aria-hidden />
                    ערוך
                  </button>
                )}
                <button
                  type="button"
                  className={iconButton}
                  aria-label={`שנה שם: ${p.name}`}
                  onClick={() => {
                    setEditing(p.id)
                    setDraft(p.name)
                  }}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" className={iconButton} aria-label={`מחק: ${p.name}`} onClick={() => setConfirming(p)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}
            {error?.id === p.id && <p role="alert" className="w-full text-xs text-destructive">{error.message}</p>}
          </li>
        ))}
        {BUILT_IN.map(b => (
          <li key={b.key} className={cn('flex min-w-0 items-center gap-2 px-4 py-3 md:px-6')}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{b.name}</p>
              <p className="truncate text-xs text-muted-foreground">{b.kind} · ייבוא מובנה</p>
              <p className="text-xs text-muted-foreground text-pretty">אפשר להחליף אותו במיפוי מותאם מחלון עריכת החשבון.</p>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden />
              מובנה
            </span>
          </li>
        ))}
      </ul>
      {profiles.length === 0 && (
        <p className="text-xs text-muted-foreground">
          עדיין אין מיפויים שמורים. אחרי ייבוא קובץ של ספק בלי ייבוא מובנה תוכל לשמור את המיפוי שלו.
        </p>
      )}

      <ProfileEditDialog
        profile={mapping}
        onOpenChange={open => !open && setMapping(null)}
        onSaved={() => router.refresh()}
      />

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={open => !open && setConfirming(null)}
        onConfirm={async () => {
          if (confirming && (await call(confirming.id, { method: 'DELETE' }))) setConfirming(null)
        }}
        title={<>למחוק את המיפוי <bdi>{asked.current?.name}</bdi>?</>}
        description="קבצים עם אותן כותרות יצטרכו מיפוי עמודות מחדש בהעלאה הבאה. תנועות שכבר יובאו לא ישתנו."
        busy={!!confirming && pending === confirming.id}
        busyLabel="מוחק…"
        error={confirming && error?.id === confirming.id ? error.message : null}
      />
    </div>
  )
}
