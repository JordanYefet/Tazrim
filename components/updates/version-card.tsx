'use client'

import { useEffect, useState } from 'react'
import { ArrowUpLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { REPO_URL } from '@/lib/about/content'
import type { UpdateView } from '@/lib/updates/state'
import { ManualCommands } from './manual-commands'
import { RollbackConfirmDialog, UpdateConfirmDialog, Ver } from './update-dialogs'

export { rollbackLossText } from './update-dialogs'

/** The README's section on updating, where adding the helper is explained */
const README_UPDATES = `${REPO_URL}#עדכון-לגרסה-חדשה`

// The About page's buttons (app/about/page.tsx), pressed a little deeper
const BUTTON =
  'relative inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-[background-color,transform] duration-quick ease-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60'
const PRIMARY = `${BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`
const SECONDARY = `${BUTTON} surface text-foreground hover:bg-muted`

const pad = (n: number) => String(n).padStart(2, '0')

/** "היום ב-09:12", "אתמול ב-21:30" or "ב-13.12 ב-09:14", in this browser's time */
export function whenText(iso: string, now: Date): string {
  const d = new Date(iso)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(now) - day(d)) / 86_400_000)
  if (days === 0) return `היום ב-${time}`
  if (days === 1) return `אתמול ב-${time}`
  return `ב-${d.getDate()}.${d.getMonth() + 1} ב-${time}`
}

const CHECK_ERROR: Record<NonNullable<UpdateView['error']>, string> = {
  NETWORK: 'אין חיבור ל-GitHub',
  RATE_LIMIT: 'GitHub ביקש לחכות קצת',
  BAD_RESPONSE: 'התשובה מ-GitHub לא הייתה תקינה',
}

/** The clock, only once in the browser: times are worded in the browser's zone, never the server's */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [])
  return now
}

/** A button whose width never changes: while busy its label hides under a spinner */
function BusyButton({ busy, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean }) {
  return (
    <button type="button" {...rest} aria-busy={busy || undefined} className={className}>
      <span className={cn('inline-flex items-center gap-1.5', busy && 'invisible')}>{children}</span>
      {busy && <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
    </button>
  )
}

/**
 * The version card at the bottom of About (ENG-98, mockup frames 1, 1b, 4a). Every
 * state keeps the same rows in the same order: the version line, the notes (with a new
 * version), the buttons, the last check, the roll back (after an update), the switch.
 */
export function VersionCard({ initial }: { initial: UpdateView }) {
  const [view, setView] = useState(initial)
  const [checking, setChecking] = useState(false)
  const [checkFailed, setCheckFailed] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const now = useNow()

  const { latest, newer, canUpdate, lastUpdate, job } = view
  const running = job?.state === 'running'

  async function check() {
    setChecking(true)
    setCheckFailed(false)
    try {
      const res = await fetch('/api/updates/check', { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      setView((await res.json()) as UpdateView)
    } catch {
      setCheckFailed(true)
    } finally {
      setChecking(false)
    }
  }

  async function openUpdate() {
    setUpdateOpen(true)
    // Fresh "is a sync running" for the dialog
    try {
      const res = await fetch('/api/updates', { cache: 'no-store' })
      if (res.ok) setView((await res.json()) as UpdateView)
    } catch {
      // The dialog keeps the state it has
    }
  }

  async function setAuto(on: boolean) {
    setView(v => ({ ...v, auto: on }))
    try {
      const res = await fetch('/api/updates/auto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setView(v => ({ ...v, auto: !on }))
    }
  }

  const updatedHere = !newer && lastUpdate && lastUpdate.to === view.current
  const versionLine = newer && latest ? (
    <>
      מותקנת: <Ver v={view.current} /> · זמינה: <Ver v={latest.version} />
    </>
  ) : updatedHere ? (
    <>
      עודכן ל-<Ver v={lastUpdate.to} />
      {now ? ` ${whenText(lastUpdate.at, now)}` : ''}. זו הגרסה האחרונה.
    </>
  ) : latest ? (
    <>
      גרסה <Ver v={view.current} /> · זו הגרסה האחרונה
    </>
  ) : (
    <>
      גרסה <Ver v={view.current} />
    </>
  )

  const when = view.checkedAt && now ? whenText(view.checkedAt, now) : null
  const checkedLine = checkFailed
    ? 'הבדיקה לא הצליחה. אפשר לנסות שוב מאוחר יותר.'
    : view.error
      ? `הבדיקה האחרונה${when ? ` (${when})` : ''} לא הצליחה: ${CHECK_ERROR[view.error]}.`
      : view.checkedAt
        ? `נבדק לאחרונה${when ? ` ${when}` : ''}`
        : 'עוד לא נבדק'

  return (
    <section aria-labelledby="version-title" className="space-y-4 rounded-xl surface p-5 text-foreground">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id="version-title" className="text-base font-semibold">
            גרסה
          </h2>
          {newer && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">גרסה חדשה</span>}
        </div>
        <p className="text-sm text-muted-foreground">{versionLine}</p>
      </div>

      {newer && latest && (
        <div className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm leading-relaxed">
          <p className="font-medium">
            מה חדש ב-<Ver v={latest.version} />
          </p>
          {latest.notes.length > 0 && (
            <ul className="list-disc space-y-0.5 ps-5 text-foreground/85">
              {latest.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <a
            href={latest.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            כל ההערות ב-GitHub
            <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(נפתח בכרטיסייה חדשה)</span>
          </a>
        </div>
      )}

      {newer && !canUpdate && (
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">אפשר לעדכן בפקודה אחת, במחשב שעליו תזרים רץ.</p>
          <ManualCommands />
          <p className="text-xs leading-relaxed text-muted-foreground">
            רוצים לעדכן מכאן בלחיצה? מוסיפים לתזרים את רכיב העדכון.{' '}
            <a href={README_UPDATES} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
              איך
              <span className="sr-only"> (נפתח בכרטיסייה חדשה)</span>
            </a>
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {running ? (
            <a href="/updating" className={PRIMARY}>
              {job.kind === 'rollback' ? 'חזרה לגרסה קודמת רצה עכשיו' : 'עדכון רץ עכשיו'}
            </a>
          ) : (
            newer &&
            latest &&
            canUpdate && (
              <button type="button" className={PRIMARY} onClick={openUpdate}>
                עדכון לגרסה <Ver v={latest.version} />
              </button>
            )
          )}
          <BusyButton busy={checking} disabled={checking} onClick={check} className={SECONDARY}>
            בדיקת עדכונים
          </BusyButton>
        </div>
        <p className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
          {checkedLine}
        </p>
      </div>

      {lastUpdate?.canRollBack && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm text-muted-foreground">משהו לא עובד כמו שצריך בגרסה החדשה?</p>
          <button type="button" className={SECONDARY} onClick={() => setRollbackOpen(true)} disabled={running}>
            חזרה לגרסה <Ver v={lastUpdate.from} />
          </button>
        </div>
      )}

      <div className="flex min-h-11 items-center justify-between gap-3 border-t pt-4">
        <span id="auto-check-label" className="text-sm text-muted-foreground">
          בדיקה אוטומטית פעם ביום
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={view.auto}
          aria-labelledby="auto-check-label"
          onClick={() => setAuto(!view.auto)}
          className={cn(
            'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-fast ease-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            view.auto ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
        >
          <span
            aria-hidden
            className={cn(
              'absolute start-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-fast ease-ui motion-reduce:transition-none',
              // RTL: "on" moves the knob toward the end (left)
              view.auto && '-translate-x-4'
            )}
          />
        </button>
      </div>

      {newer && latest && canUpdate && (
        <UpdateConfirmDialog open={updateOpen} onOpenChange={setUpdateOpen} release={latest} syncRunning={view.syncRunning} />
      )}
      {lastUpdate?.canRollBack && (
        <RollbackConfirmDialog
          open={rollbackOpen}
          onOpenChange={setRollbackOpen}
          last={lastUpdate}
          backupWhen={now ? whenText(lastUpdate.backupAt, now) : null}
        />
      )}
    </section>
  )
}
