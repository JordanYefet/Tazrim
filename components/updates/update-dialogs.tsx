'use client'

import { useState } from 'react'
import { Info, TriangleAlert } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { LastUpdate } from '@/lib/updates/state'
import type { ReleaseInfo } from '@/lib/updates/version'

/** A version, left to right with even digits, inside Hebrew text */
export function Ver({ v }: { v: string }) {
  return (
    <span dir="ltr" className="tabular-nums">
      v{v}
    </span>
  )
}

const START_FAILED = 'העדכון לא התחיל. נסו שוב.'
const ROLLBACK_FAILED = 'החזרה לגרסה הקודמת לא התחילה. נסו שוב.'

/** POSTs and, on 202, leaves for the progress page; otherwise the route's own Hebrew text */
async function post(url: string, body: unknown, fallback: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    if (res.ok) return null
    const json = (await res.json().catch(() => null)) as { error?: string } | null
    return json?.error || fallback
  } catch {
    return fallback
  }
}

/** Frame 2: the notes, the backup and restart line, "עדכון עכשיו" / "ביטול". Waits while a sync runs. */
export function UpdateConfirmDialog({
  open,
  onOpenChange,
  release,
  syncRunning,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  release: ReleaseInfo
  syncRunning: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function confirm() {
    setBusy(true)
    setError(null)
    const failed = await post('/api/updates/start', { version: release.version }, START_FAILED)
    if (failed) {
      setError(failed)
      setBusy(false)
      return
    }
    // Stays busy: the page is leaving
    location.assign(`/updating?start=${encodeURIComponent(release.version)}`)
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={o => {
        if (!o) setError(null)
        onOpenChange(o)
      }}
      onConfirm={confirm}
      title={
        <>
          עדכון לגרסה <Ver v={release.version} />
        </>
      }
      description={
        release.notes.length > 0 ? (
          <ul className="list-disc space-y-1 rounded-xl bg-muted/60 py-2.5 pe-3 ps-7 text-foreground/85">
            {release.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : undefined
      }
      confirmLabel="עדכון עכשיו"
      busyLabel="מתחילים…"
      destructive={false}
      busy={busy}
      confirmDisabled={syncRunning}
      error={error}
    >
      <p className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>לפני העדכון נשמר גיבוי של כל הנתונים. במהלך העדכון האפליקציה תופעל מחדש ולא תהיה זמינה לכמה שניות.</span>
      </p>
      {syncRunning && <p className="text-sm font-medium text-foreground">סנכרון רץ עכשיו. אפשר לעדכן כשהוא יסתיים.</p>}
    </ConfirmDialog>
  )
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('#', String(n)))

/** What a roll back would delete, from the counts saved since the backup (transactions are an estimate) */
export function rollbackLossText(since: LastUpdate['since']): string {
  if (since.uploads === 0 && since.transactions === 0) return 'מאז הגיבוי לא נוספו קבצים או תנועות.'
  const uploads = plural(since.uploads, 'העלאה אחת', '# העלאות')
  const transactions = plural(since.transactions, 'תנועה אחת', 'כ-# תנועות')
  return `כל מה שנוסף או שונה מאז (${uploads}, ${transactions}) יימחק.`
}

/** Frame 5: what a roll back does, the backup's time, what it deletes, and that everyone signs in again */
export function RollbackConfirmDialog({
  open,
  onOpenChange,
  last,
  backupWhen,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  last: LastUpdate
  /** The backup's time in words ("היום ב-09:14"), or null before the page knows the clock */
  backupWhen: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function confirm() {
    setBusy(true)
    setError(null)
    const failed = await post('/api/updates/rollback', undefined, ROLLBACK_FAILED)
    if (failed) {
      setError(failed)
      setBusy(false)
      return
    }
    location.assign('/updating?start=rollback')
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={o => {
        if (!o) setError(null)
        onOpenChange(o)
      }}
      onConfirm={confirm}
      title={
        <>
          חזרה לגרסה <Ver v={last.from} />
        </>
      }
      description={
        <p>
          תזרים יחזור לגרסה הקודמת ולגיבוי שנשמר לפני העדכון{backupWhen ? `, ${backupWhen}` : ''}.
        </p>
      }
      confirmLabel="חזרה לגרסה הקודמת"
      busyLabel="מתחילים…"
      destructive
      busy={busy}
      error={error}
    >
      {/* Red only when something would be lost */}
      <p
        className={
          last.since.uploads + last.since.transactions > 0
            ? 'flex gap-2 text-sm leading-relaxed text-destructive dark:text-red-400'
            : 'flex gap-2 text-sm leading-relaxed text-muted-foreground'
        }
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{rollbackLossText(last.since)}</span>
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">כל מי שמחובר יצטרך להתחבר מחדש.</p>
    </ConfirmDialog>
  )
}
