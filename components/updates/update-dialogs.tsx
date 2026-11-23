'use client'

import { useState } from 'react'
import { Info, TriangleAlert } from 'lucide-react'
import { ApprovalDialog } from '@/components/egress/approval-dialog'
import type { Proof } from '@/components/egress/api'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { changingFiles, confirmedFiles, needsDialog, type Approval, type UpdatePlan } from '@/lib/updates/compose'
import type { LastUpdate } from '@/lib/updates/state'
import type { ReleaseInfo } from '@/lib/updates/version'
import { ComposeFilesDialog } from './compose-files'

/** x.y.z, or null (a last update recorded from an image without a version label says 'unknown') */
export const knownVersion = (v: string | null | undefined): string | null => (v && /^\d+\.\d+\.\d+$/.test(v) ? v : null)

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

/** POSTs: null on success, otherwise the route's own Hebrew text and its fixed code */
async function post(url: string, body: unknown, fallback: string): Promise<{ error: string; code?: string } | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    if (res.ok) return null
    const json = (await res.json().catch(() => null)) as { error?: string; code?: string } | null
    return { error: json?.error || fallback, code: json?.code }
  } catch {
    return { error: fallback }
  }
}

const PLAN_FAILED = 'לא הצלחנו לבדוק מה משתנה בקובצי ההתקנה. נסו שוב.'
/** The codes that mean "what you confirmed is not what would happen now": look again from the start */
const STALE = ['COMPOSE_CHANGED', 'COMPOSE_NEEDS_CONFIRM']

/** What the update would do to the compose files, asked for before anything starts: { plan }, or the route's Hebrew text */
async function fetchPlan(version: string): Promise<{ plan: UpdatePlan } | { error: string }> {
  try {
    const res = await fetch('/api/updates/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) })
    const json = (await res.json().catch(() => null)) as (UpdatePlan & { error?: string }) | null
    if (res.ok && json && Array.isArray(json.files)) return { plan: json }
    return { error: json?.error || PLAN_FAILED }
  } catch {
    return { error: PLAN_FAILED }
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
  const [plan, setPlan] = useState<UpdatePlan | null>(null)
  const [filesOpen, setFilesOpen] = useState(false)
  const [filesBusy, setFilesBusy] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)

  /** Starts the update; `compose` is what the person confirmed about the install folder's files, when there was something to replace */
  async function start(p: UpdatePlan, approval?: Approval) {
    const changing = changingFiles(p).length > 0
    const failed = await post(
      '/api/updates/start',
      { version: release.version, ...(changing ? { compose: { files: confirmedFiles(p), ...(approval ? { approval } : {}) } } : {}) },
      START_FAILED
    )
    // Stays busy when it started: the page is leaving
    if (!failed) location.assign(`/updating?start=${encodeURIComponent(release.version)}${p.step ? '&compose=1' : ''}`)
    return failed
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    const r = await fetchPlan(release.version)
    if ('error' in r) {
      setError(r.error)
      setBusy(false)
      return
    }
    if (needsDialog(r.plan)) {
      // The files window follows; this one waits behind it
      setPlan(r.plan)
      setFilesError(null)
      setFilesOpen(true)
      setBusy(false)
      return
    }
    const failed = await start(r.plan)
    if (failed) {
      setError(failed.error)
      setBusy(false)
    }
  }

  /** From the files window: the update starts, with the approval when one was needed and given */
  async function go(p: UpdatePlan, approval?: Approval) {
    setFilesBusy(true)
    setFilesError(null)
    const failed = await start(p, approval)
    if (!failed) return
    setFilesBusy(false)
    if (failed.code && STALE.includes(failed.code)) {
      // What was shown is not what would happen now: back to the first window, to look again
      setFilesOpen(false)
      setApproving(false)
      setError(failed.error)
    } else setFilesError(failed.error)
  }

  return (
    <>
      <ConfirmDialog
        // The files window takes its place while it is open
        open={open && !filesOpen}
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
      {plan && (
        <>
          <ComposeFilesDialog
            open={open && filesOpen}
            onOpenChange={o => {
              if (o) return
              setFilesOpen(false)
              setFilesError(null)
              onOpenChange(false)
            }}
            plan={plan}
            busy={filesBusy}
            error={filesError}
            onConfirm={() => (plan.needsApproval && plan.approvers ? setApproving(true) : void go(plan))}
          />
          {/* The same approval window as network isolation's: here it only collects the proof, and the updater checks it */}
          <ApprovalDialog<Proof>
            change={approving ? { action: 'update-compose', version: release.version, files: confirmedFiles(plan) } : null}
            onClose={() => setApproving(false)}
            finish={async proof => proof}
            confirmLabel="אישור ועדכון"
            onApproved={proof => {
              setApproving(false)
              void go(plan, proof as Approval)
            }}
          />
        </>
      )}
    </>
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

/** Frame 5: what a roll back does, the backup's time, what it deletes, and who signs in again. Waits while a sync runs. */
export function RollbackConfirmDialog({
  open,
  onOpenChange,
  last,
  backupWhen,
  syncRunning,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  last: LastUpdate
  syncRunning: boolean
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
      setError(failed.error)
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
        knownVersion(last.from) ? (
          <>
            חזרה לגרסה <Ver v={last.from} />
          </>
        ) : (
          'חזרה לגרסה הקודמת'
        )
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
      confirmDisabled={syncRunning}
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
      <p className="text-sm leading-relaxed text-muted-foreground">מי שהתחבר אחרי העדכון יצטרך להתחבר מחדש.</p>
      {syncRunning && <p className="text-sm font-medium text-foreground">סנכרון רץ עכשיו. אפשר לחזור לגרסה הקודמת כשהוא יסתיים.</p>}
    </ConfirmDialog>
  )
}
