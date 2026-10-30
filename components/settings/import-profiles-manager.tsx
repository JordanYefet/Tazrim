'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Columns3, Trash2 } from 'lucide-react'
import { providerLabel } from '@/components/upload/account-picker'
import type { ProfileView } from '@/lib/import/profile-view'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ProfileEditDialog } from './profile-edit-dialog'
import { AppDialog } from '@/components/ui/app-dialog'


const kindLabel = (k: ProfileView['accountKind']) => (k === 'BANK' ? 'חשבון בנק' : k === 'CREDIT_CARD' ? 'כרטיס אשראי' : k)

/**
 * Saved column mappings (ENG-24): a row per mapping opens its window to rename it,
 * edit it (ENG-69, from the stored header, no file) or delete it.
 */
export function ImportProfilesManager({ profiles }: { profiles: ProfileView[] }) {
  const router = useRouter()
  // The mapping whose window is open (and the last one, while it animates out)
  const [open, setOpen] = useState<ProfileView | null>(null)
  const lastOpen = useRef<ProfileView | null>(null)
  if (open) lastOpen.current = open
  const shownProfile = open ?? lastOpen.current
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
    if (ok) setOpen(null)
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 id="import-profiles-title" className="text-lg font-semibold">מיפויי ייבוא</h2>
        <p className="text-sm text-muted-foreground">
          מיפויי עמודות שנשמרו בהעלאת קבצים. קובץ עם אותן כותרות מזוהה לבד, ואפשר לערוך מיפוי גם בלי קובץ.
        </p>
      </div>
      {profiles.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl surface">
          {profiles.map(p => (
            <li key={p.id}>
              {/* The row opens the mapping's window: rename, edit the columns, delete */}
              <button
                type="button"
                onClick={() => { setOpen(p); setDraft(p.name); setError(null) }}
                className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/40 active:bg-muted/60 md:px-6"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
                  <Columns3 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {providerLabel(p.provider)} · {kindLabel(p.accountKind)}
                    {p.account && <> · ברירת מחדל של {p.account.displayName}</>}
                  </span>
                </span>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          עדיין אין מיפויים שמורים. אחרי ייבוא קובץ תוכל לשמור את המיפוי שלו לפעמים הבאות.
        </p>
      )}

      <AppDialog open={!!open} onOpenChange={o => !o && setOpen(null)} title={<bdi>{shownProfile?.name}</bdi>}>
        {shownProfile && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {providerLabel(shownProfile.provider)} · {kindLabel(shownProfile.accountKind)}
              {shownProfile.account && <> · ברירת מחדל של {shownProfile.account.displayName}</>}
            </p>
            <form onSubmit={e => rename(e, shownProfile.id)} className="flex gap-2">
              <label htmlFor="profile-name" className="sr-only">שם המיפוי</label>
              <input
                id="profile-name"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                maxLength={80}
                className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={pending === shownProfile.id || !draft.trim() || draft.trim() === shownProfile.name}
                className="h-11 rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-[opacity,transform] active:scale-[0.97] disabled:opacity-40"
              >
                שמירה
              </button>
            </form>
            <ul className="overflow-hidden rounded-xl bg-muted/40 divide-y divide-border/60">
              {shownProfile.fileless && (
                <li>
                  <button
                    type="button"
                    onClick={() => { const p = shownProfile; setOpen(null); setMapping(p) }}
                    className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-start transition-colors hover:bg-muted"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
                      <Columns3 className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px]">עריכת המיפוי</span>
                      <span className="block text-xs text-muted-foreground">אילו עמודות בקובץ הן התאריך, התיאור והסכום</span>
                    </span>
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() => { const p = shownProfile; setOpen(null); setConfirming(p) }}
                  className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-start transition-colors hover:bg-muted"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive" aria-hidden>
                    <Trash2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-destructive">מחיקת המיפוי</span>
                    <span className="block text-xs text-muted-foreground">תנועות שכבר יובאו לא ישתנו</span>
                  </span>
                </button>
              </li>
            </ul>
            {error?.id === shownProfile.id && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
          </div>
        )}
      </AppDialog>

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
