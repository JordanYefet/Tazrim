'use client'

/**
 * The full-screen page shown while Tazrim updates itself or rolls back (ENG-98).
 * Everything it needs (strings, polling, the done and failed states) lives in this
 * one module: while the app restarts nothing new can load, so nothing new may be needed.
 */
import { useEffect, useRef, useState } from 'react'
import type { JobStatus, StepId } from '@/lib/updates/helper'
import type { UpdateView } from '@/lib/updates/state'
import { ghostButton, primaryButton } from '@/components/auth/ui'

export const MANUAL_COMMAND = 'docker compose pull && docker compose up -d'

/** The sign-in card's buttons, kept on one line in the two halves */
const half = (cls: string) => `${cls.replace('px-5', 'px-3')} whitespace-nowrap`
const primaryHalf = half(primaryButton)
const secondaryHalf = half(ghostButton)

const POLL_MS = 1000
/** A poll that takes longer than this counts as the app being down */
const POLL_TIMEOUT_MS = 4000
/** How long the done state shows before going back to About */
const DONE_MS = 1200
/** Unreachable this long in a row: the app did not come back, which is a failure (polling goes on) */
export const STUCK_MS = 5 * 60 * 1000
/** Polls to wait for a job that was just started to show up before giving up on it */
const WAIT_POLLS = 20

const UPDATE_ROWS: StepId[] = ['backup', 'download', 'restart', 'migrate', 'check']
const ROLLBACK_ROWS: StepId[] = ['restore', 'restart', 'check']

const LABEL: Record<StepId, string> = {
  backup: 'גיבוי הנתונים',
  download: 'הורדת הגרסה החדשה',
  restart: 'הפעלה מחדש',
  migrate: 'עדכון בסיס הנתונים',
  check: 'בדיקה שהכול עובד',
  restore: 'שחזור הנתונים מהגיבוי',
}

/** The failed row's short reason */
const REASON: Record<StepId, string> = {
  backup: 'לא הצלחנו לשמור גיבוי',
  download: 'ההורדה לא הצליחה',
  restart: 'ההפעלה מחדש לא הצליחה',
  migrate: 'הגרסה החדשה לא עלתה',
  check: 'הגרסה החדשה לא עברה את הבדיקה',
  restore: 'השחזור מהגיבוי לא הצליח',
}

const rowIds = (job: JobStatus) => (job.kind === 'rollback' ? ROLLBACK_ROWS : UPDATE_ROWS)

/** Where the bar stands while each step runs (download moves on from here by its bytes) */
const AT: Record<StepId, number> = { backup: 0.1, download: 0.1, restart: 0.65, migrate: 0.8, check: 0.92, restore: 0.3 }

/** The bar, 0..1: the running (or failed) step's place; the download moves it from .1 to .5 by bytes */
export function progressOf(job: JobStatus): number {
  if (job.state === 'done') return 1
  const ids = rowIds(job)
  const active = job.steps.find(s => ids.includes(s.id) && (s.state === 'running' || s.state === 'failed'))
  if (!active) return job.steps.every(s => s.state === 'done') ? 1 : 0
  if (active.id === 'download') {
    const d = job.downloaded
    const frac = d && d.total > 0 ? Math.min(1, Math.max(0, d.current / d.total)) : 0
    return AT.download + 0.4 * frac
  }
  return AT[active.id]
}

export interface Screen {
  job: JobStatus
  /** The version the app that answered runs */
  current: string
  /** The last poll got no answer (the app is restarting) */
  offline: boolean
  /** When the polls stopped getting answers (ms), while offline */
  offlineSince?: number
  /** Offline for STUCK_MS: shown as a failure at the restart */
  stuck?: boolean
  /** A job was just started: until it shows up, a finished job with this finishedAt is the old one */
  waitingFor?: { stale: string | null; polls: number }
}

export type PollOutcome = { kind: 'view'; view: UpdateView } | { kind: 'network' } | { kind: 'status'; status: number }

/** The restart has begun (or the app has already been away), so the app may now be another version */
function pastRestart(s: Screen): boolean {
  if (s.offline) return true
  const ids = rowIds(s.job)
  const at = ids.indexOf('restart')
  return s.job.steps.some(st => ids.indexOf(st.id) >= at && st.state !== 'waiting')
}

function pendingJob(kind: JobStatus['kind'], from: string, to: string): JobStatus {
  const ids = kind === 'rollback' ? ROLLBACK_ROWS : UPDATE_ROWS
  return { kind, from, to, state: 'running', restored: false, steps: ids.map((id, i) => ({ id, state: i === 0 ? 'running' : 'waiting' })) }
}

/** The page's first state: the view's job, or (just started, `start` given) a job waiting to show up */
export function startScreen(view: UpdateView, start?: string): Screen {
  const job = view.job
  if (job && (job.state === 'running' || start === undefined)) return { job, current: view.current, offline: false }
  const kind: JobStatus['kind'] = start === 'rollback' ? 'rollback' : 'update'
  const to =
    kind === 'rollback'
      ? view.lastUpdate?.from || (job?.kind === 'update' ? job.from : undefined) || view.current
      : start || view.latest?.version || job?.to || view.current
  return { job: pendingJob(kind, view.current, to), current: view.current, offline: false, waitingFor: { stale: job?.finishedAt ?? null, polls: 0 } }
}

/** One poll's answer applied to the screen; `go` leaves the page */
export function applyPoll(s: Screen, o: PollOutcome): Screen | { go: string } {
  const away = (): Screen => {
    const now = Date.now()
    const since = s.offline && s.offlineSince !== undefined ? s.offlineSince : now
    return { ...s, offline: true, offlineSince: since, stuck: now - since >= STUCK_MS }
  }
  if (o.kind === 'network') return away()
  if (o.kind === 'status') {
    // This route is gone (an older version) or the session went with a restored backup: the app is back, on another version
    if ((o.status === 404 || o.status === 401) && pastRestart(s)) return { go: '/' }
    return away()
  }
  const { view } = o
  const job = view.job
  if (s.waitingFor) {
    const fresh = !!job && (job.state === 'running' || (job.finishedAt ?? null) !== s.waitingFor.stale)
    if (!fresh) {
      const polls = s.waitingFor.polls + 1
      if (polls < WAIT_POLLS) return { ...s, current: view.current, offline: false, waitingFor: { ...s.waitingFor, polls } }
      return job ? { job, current: view.current, offline: false } : { go: '/about' }
    }
  }
  if (!job) return { ...s, current: view.current, offline: false, waitingFor: undefined }
  return { job, current: view.current, offline: false }
}

type RowState = 'waiting' | 'running' | 'done' | 'failed'
export interface Row {
  id: StepId
  label: string
  state: RowState
  note: string
}

const isDone = (s: Screen) => s.job.state === 'done' && s.current === s.job.to

/**
 * What the screen shows: done only once the app answers as the new version; while the
 * app is away during an update, the restart runs (a roll back stops the app inside its
 * restore, so its rows stay as last reported); away for STUCK_MS, the restart failed.
 */
function shownJob(s: Screen): JobStatus {
  const { job } = s
  if (s.stuck && job.state !== 'failed') {
    const ids = rowIds(job)
    const at = ids.indexOf('restart')
    // An update's rows before the restart are done by then; a roll back's restore may still be what stalled
    const doneUpTo = job.kind === 'rollback' ? job.steps.filter(st => st.state === 'done' && ids.includes(st.id)).length : at
    const failedAt = Math.min(at, doneUpTo)
    return {
      ...job,
      state: 'failed',
      restored: false,
      steps: ids.map((id, i) => ({ id, state: i < failedAt ? 'done' : i === failedAt ? 'failed' : 'waiting' })),
    }
  }
  if (job.state === 'done' && !isDone(s)) {
    return { ...job, state: 'running', steps: job.steps.map(st => (st.id === 'check' ? { ...st, state: 'running' } : st)) }
  }
  if (!s.offline || job.state !== 'running' || job.kind === 'rollback') return job
  const ids = rowIds(job)
  const at = ids.indexOf('restart')
  if (job.steps.find(st => st.id === 'restart')?.state !== 'waiting') return job
  return {
    ...job,
    steps: job.steps.map(st => {
      const i = ids.indexOf(st.id)
      if (i < 0) return st
      return { ...st, state: i < at ? 'done' : i === at ? 'running' : 'waiting' }
    }),
  }
}

function mb(bytes: number): string {
  return String(Math.round(bytes / (1024 * 1024)))
}

/** The rows, always the same ones in the same order: five for an update, three for a roll back */
export function rowsOf(s: Screen): Row[] {
  const job = shownJob(s)
  if (isDone(s)) return rowIds(job).map(id => ({ id, label: LABEL[id], state: 'done', note: '' }))
  const ids = rowIds(job)
  const rows: Row[] = ids.map(id => ({ id, label: LABEL[id], state: job.steps.find(st => st.id === id)?.state ?? 'waiting', note: '' }))
  if (job.state === 'failed') {
    // The helper may append its own step (the restore after a failed update): the row that failed is one of ours
    let failed = rows.findIndex(r => r.state === 'failed')
    if (failed < 0) {
      failed = rows.findIndex(r => r.state === 'running')
      if (failed < 0) failed = Math.max(0, rows.map(r => r.state).lastIndexOf('done'))
    }
    return rows.map((r, i) =>
      i === failed ? { ...r, state: 'failed', note: REASON[r.id] } : r.state === 'running' || r.state === 'failed' ? { ...r, state: 'waiting' } : r
    )
  }
  const dl = rows.find(r => r.id === 'download')
  if (dl && dl.state === 'running' && job.downloaded && job.downloaded.total > 0) {
    dl.note = `${mb(job.downloaded.current)} / ${mb(job.downloaded.total)} MB`
  }
  return rows
}

function V({ v }: { v: string }) {
  return (
    <span dir="ltr" className="tabular-nums">
      v{v}
    </span>
  )
}

type Phase = 'running' | 'done' | 'failed'
const phaseOf = (s: Screen): Phase => (isDone(s) ? 'done' : s.job.state === 'failed' || s.stuck ? 'failed' : 'running')

/** Under the buttons when "לנסות שוב" could not start the job and the route gave no text */
export const retryErrorText = (kind: JobStatus['kind']): string =>
  kind === 'rollback' ? 'החזרה לגרסה הקודמת לא התחילה. נסו שוב.' : 'העדכון לא התחיל. נסו שוב.'

function Heading({ s, rows }: { s: Screen; rows: Row[] }) {
  const { job } = s
  const rollback = job.kind === 'rollback'
  const phase = phaseOf(s)
  if (phase === 'done') {
    return (
      <>
        <h1 className="min-h-[30px] text-xl font-semibold tracking-tight">
          {rollback ? 'חזרנו לגרסה ' : 'עודכן לגרסה '}
          <V v={job.to} />
        </h1>
        <p className="mt-1 min-h-11 text-sm leading-relaxed text-muted-foreground">חוזרים לאפליקציה…</p>
      </>
    )
  }
  if (phase === 'failed') {
    const ids = rowIds(job)
    const failedAt = ids.indexOf(rows.find(r => r.state === 'failed')?.id ?? 'check')
    const afterRestart = failedAt >= ids.indexOf('restart')
    return (
      <>
        <h1 className="min-h-[30px] text-xl font-semibold tracking-tight">{rollback ? 'החזרה לגרסה הקודמת לא הושלמה' : 'העדכון לא הושלם'}</h1>
        <p className="mt-1 min-h-11 text-sm leading-relaxed text-muted-foreground">
          {s.stuck ? (
            'תזרים לא חזר לפעול. אפשר להריץ את הפקודה הידנית כדי להפעיל אותו מחדש.'
          ) : job.restored && rollback && afterRestart ? (
            <>
              תזרים חזר לגרסה <V v={job.from} />, והנתונים לא השתנו.
            </>
          ) : job.restored ? (
            <>
              תזרים חזר לגרסה <V v={job.from} />.{afterRestart ? ' הנתונים שמורים כפי שהיו לפני העדכון.' : ''}
            </>
          ) : afterRestart ? (
            'משהו השתבש בזמן העדכון. כדאי לפתוח את הפקודות הידניות.'
          ) : (
            <>
              תזרים ממשיך לרוץ על <V v={job.from} />, ושום נתון לא השתנה.
            </>
          )}
        </p>
      </>
    )
  }
  return (
    <>
      <h1 className="min-h-[30px] text-xl font-semibold tracking-tight">
        {rollback ? 'חוזרים לגרסה ' : 'מעדכנים לגרסה '}
        <V v={job.to} />
      </h1>
      <p className="mt-1 min-h-11 text-sm leading-relaxed text-muted-foreground">אפשר להשאיר את הדף פתוח. הוא יתרענן לבד בסיום.</p>
    </>
  )
}

function StepIcon() {
  // Four layers in one fixed box; the row's data-s picks which shows (cross-faded in CSS)
  return (
    <span className="update-ic" aria-hidden>
      <span className="update-ic-w" />
      <span className="update-ic-r" />
      <span className="update-ic-d">✓</span>
      <span className="update-ic-f">!</span>
    </span>
  )
}

const STATE_WORD: Record<RowState, string> = { waiting: 'ממתין', running: 'בתהליך', done: 'הושלם', failed: 'נכשל' }

function ManualCommands() {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(MANUAL_COMMAND)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // No clipboard (plain http): the command is selectable
    }
  }
  return (
    <div className="mt-1 space-y-2 rounded-xl bg-muted p-3">
      <p className="text-sm text-muted-foreground">בתיקייה של תזרים במחשב שעליו הוא רץ:</p>
      <p dir="ltr" className="select-all break-words font-mono text-sm">
        {MANUAL_COMMAND}
      </p>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary transition-colors duration-quick hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? 'הועתק' : 'העתקה'}
      </button>
    </div>
  )
}

/** The card itself, from a screen: no polling here (tests render it directly) */
export function UpdatingCard({
  screen,
  manualOpen,
  onToggleManual,
  onRetry,
  retrying = false,
  retryError = null,
}: {
  screen: Screen
  manualOpen: boolean
  onToggleManual?: () => void
  onRetry?: () => void
  retrying?: boolean
  retryError?: string | null
}) {
  const phase = phaseOf(screen)
  const rows = rowsOf(screen)
  const failed = phase === 'failed'
  const progress = phase === 'done' ? 1 : progressOf(shownJob(screen))
  return (
    <div className="w-full max-w-sm rounded-[28px] surface-raised p-6">
      <div role="status" aria-live="polite">
        <span
          aria-hidden
          className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-[22px] font-extrabold leading-none text-primary-foreground"
        >
          ת
        </span>
        <Heading s={screen} rows={rows} />
      </div>
      <div className="update-track mb-1.5 mt-[18px]" aria-hidden>
        <div className="update-fill" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <ul className="mt-3.5 grid gap-3">
        {rows.map(r => (
          <li key={r.id} data-s={r.state} className="update-step">
            <StepIcon />
            <span>
              {r.label}
              <span className="sr-only">: {STATE_WORD[r.state]}</span>
            </span>
            <span className="update-note">{r.note && (r.id === 'download' && r.state === 'running' ? <span dir="ltr" className="tabular-nums">{r.note}</span> : r.note)}</span>
          </li>
        ))}
      </ul>
      {/* Reserved in every state, shown on a failure, so nothing moves when it appears */}
      <div className="update-actions mt-[22px] grid min-h-12 grid-cols-2 gap-2.5" data-shown={failed || undefined} aria-hidden={!failed || undefined}>
        <button type="button" className={primaryHalf} onClick={onRetry} disabled={!failed || retrying || !!screen.stuck} tabIndex={failed ? undefined : -1}>
          לנסות שוב
        </button>
        <a href="/" className={secondaryHalf} tabIndex={failed ? undefined : -1}>
          חזרה לאפליקציה
        </a>
      </div>
      <p className="mt-2 min-h-5 text-center text-sm text-destructive dark:text-red-400" role="alert">
        {failed ? retryError : null}
      </p>
      <button
        type="button"
        className="update-actions flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-primary transition-colors duration-quick hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-shown={failed || undefined}
        aria-hidden={!failed || undefined}
        aria-expanded={manualOpen}
        tabIndex={failed ? undefined : -1}
        disabled={!failed}
        onClick={onToggleManual}
      >
        הצגת פקודות ידניות
      </button>
      {failed && manualOpen && <ManualCommands />}
    </div>
  )
}

/** The page: polls the update's state every second and follows it to done (About) or a failure */
export function UpdatingScreen({ initial, start }: { initial: UpdateView; start?: string }) {
  const [screen, setScreen] = useState<Screen>(() => startScreen(initial, start))
  const [manualOpen, setManualOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const ref = useRef(screen)
  useEffect(() => {
    ref.current = screen
  }, [screen])
  const leaving = useRef(false)

  const phase = phaseOf(screen)

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      let outcome: PollOutcome
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), POLL_TIMEOUT_MS)
      try {
        const res = await fetch('/api/updates', { cache: 'no-store', signal: ctl.signal })
        outcome = res.ok ? { kind: 'view', view: (await res.json()) as UpdateView } : { kind: 'status', status: res.status }
      } catch {
        outcome = { kind: 'network' }
      } finally {
        clearTimeout(t)
      }
      if (stop || leaving.current) return
      const next = applyPoll(ref.current, outcome)
      if ('go' in next) {
        leaving.current = true
        location.assign(next.go)
        return
      }
      setScreen(next)
      timer = setTimeout(poll, POLL_MS)
    }
    timer = setTimeout(poll, POLL_MS)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'done') return
    leaving.current = true
    const t = setTimeout(() => location.assign('/about'), DONE_MS)
    return () => clearTimeout(t)
  }, [phase])

  async function retry() {
    const { job } = ref.current
    setRetrying(true)
    setRetryError(null)
    try {
      const res =
        job.kind === 'rollback'
          ? await fetch('/api/updates/rollback', { method: 'POST' })
          : await fetch('/api/updates/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ version: job.to }),
            })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setRetryError(body?.error || retryErrorText(job.kind))
        return
      }
      setManualOpen(false)
      setScreen(s => ({
        job: pendingJob(job.kind, s.current, job.to),
        current: s.current,
        offline: false,
        waitingFor: { stale: job.finishedAt ?? null, polls: 0 },
      }))
    } catch {
      setRetryError(retryErrorText(job.kind))
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div data-update-state={phase} className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden overflow-clip p-4 py-10">
      <div aria-hidden className="update-drift pointer-events-none absolute -inset-[20%] -z-10">
        <i className="update-bg-work" />
        <i className="update-bg-done" />
        <i className="update-bg-fail" />
      </div>
      <UpdatingCard
        screen={screen}
        manualOpen={manualOpen}
        onToggleManual={() => setManualOpen(o => !o)}
        onRetry={retry}
        retrying={retrying}
        retryError={retryError}
      />
    </div>
  )
}
