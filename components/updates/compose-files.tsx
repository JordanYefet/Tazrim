'use client'

import { Info } from 'lucide-react'
import { AppDialog } from '@/components/ui/app-dialog'
import { Busy, Host, PRIMARY, SECONDARY } from '@/components/egress/ui'
import { cn } from '@/lib/utils/cn'
import type { PlanFile, UpdatePlan } from '@/lib/updates/compose'

/** What happens to each file, in a word */
const ACTION_WORD: Record<string, string> = {
  replace: 'יוחלף',
  create: 'ייווצר',
  edited: 'לא יוחלף',
}

/** The files the person sees: replaced, created, or edited by them (left alone, the new one beside it) */
export const shownFiles = (plan: UpdatePlan): PlanFile[] => plan.files.filter(f => f.action === 'replace' || f.action === 'create' || f.action === 'edited')

/** One line of a unified diff: the sign says it too, the tint only helps */
function DiffLine({ line }: { line: string }) {
  const kind = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : line.startsWith('@@') ? 'hunk' : 'ctx'
  return (
    <span
      data-diff={kind}
      className={cn(
        'block whitespace-pre px-1',
        kind === 'add' && 'bg-income/10 text-income',
        kind === 'del' && 'bg-expense/10 text-expense',
        kind === 'hunk' && 'text-muted-foreground'
      )}
    >
      {line || ' '}
    </span>
  )
}

/** A diff, left to right whatever the page's direction, scrollable both ways (and by keyboard) */
export function DiffBlock({ name, diff, truncated }: { name: string; diff: string; truncated?: boolean }) {
  return (
    <div className="space-y-1">
      <pre
        dir="ltr"
        tabIndex={0}
        aria-label={`השינויים ב-${name}`}
        className="max-h-56 overflow-auto rounded-lg bg-muted/60 py-2 font-mono text-xs leading-5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {diff.split('\n').map((l, i) => (
          <DiffLine key={i} line={l} />
        ))}
      </pre>
      {truncated && <p className="text-xs text-muted-foreground">ההשוואה ארוכה, ומוצגת רק ההתחלה שלה.</p>}
    </div>
  )
}

/** Every shown file with what happens to it and its diff */
export function ComposeFiles({ plan }: { plan: UpdatePlan }) {
  return (
    <ul className="space-y-4">
      {shownFiles(plan).map(f => (
        <li key={f.name} className="space-y-1.5">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium">
            <Host>{f.name}</Host>
            <span className="text-muted-foreground">{ACTION_WORD[f.action]}</span>
          </p>
          {f.action === 'edited' && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              ערכת את הקובץ הזה בעצמך, אז הוא לא יוחלף. הגרסה החדשה נשמרה לידו בשם <Host>{f.name}.new</Host>
            </p>
          )}
          {f.diff ? <DiffBlock name={f.name} diff={f.diff} truncated={f.truncated} /> : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * What an update changes in the install folder, before it happens. The files in the install folder
 * are listed with their diffs; "אישור ועדכון" goes on (with an approval, when approvers exist).
 */
export function ComposeFilesDialog({
  open,
  onOpenChange,
  plan,
  busy,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: UpdatePlan
  busy: boolean
  error: string | null
  onConfirm: () => void
}) {
  const replaced = plan.files.some(f => f.action === 'replace' || f.action === 'create')
  return (
    <AppDialog open={open} onOpenChange={o => !busy && onOpenChange(o)} title="קובצי ההתקנה ישתנו" className="sm:max-w-xl">
      <div className="mt-3 space-y-4 text-sm leading-relaxed">
        <p className="text-pretty text-muted-foreground">
          {replaced
            ? 'הגרסה החדשה מביאה איתה גם קובצי התקנה חדשים, בתיקייה של תזרים במחשב. כך הם ייראו אחרי העדכון. '
            : 'חלק מקובצי ההתקנה ערוכים אצלך, ולכן לא יוחלפו. '}
          לפני כל החלפה נשמר עותק של הקובץ הקודם, בשם שמסתיים ב-bak.
        </p>

        <div className="max-h-[50dvh] overflow-y-auto overscroll-contain pe-1">
          <ComposeFiles plan={plan} />
        </div>

        <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            שינויים אישיים שומרים בקובץ <Host>docker-compose.override.yml</Host> או ב-<Host>.env</Host>: את שניהם העדכון לא נוגע בהם.
          </span>
        </p>

        <p role="alert" className="min-h-5 text-destructive">
          {error}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={SECONDARY} disabled={busy} onClick={() => onOpenChange(false)}>
            ביטול
          </button>
          <button type="button" className={PRIMARY} disabled={busy} aria-busy={busy || undefined} onClick={onConfirm}>
            <Busy busy={busy}>אישור ועדכון</Busy>
          </button>
        </div>
      </div>
    </AppDialog>
  )
}
