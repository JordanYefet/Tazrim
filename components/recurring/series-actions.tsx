'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, EyeOff, Pencil, SlidersHorizontal, Trash2, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { isManualCadence, normalizePattern, type ManualInfo } from '@/lib/insights/manual-recurring'
import type { Cadence } from '@/lib/insights/recurring'
import { ManualSeriesForm, RecurringSheet, type ManualDraft } from './manual-series-form'

export interface SeriesActionsProps {
  seriesKey: string
  baseKey: string
  accountId: string | null
  overrideKey: string | null
  status: 'confirmed' | 'dismissed' | null
  name: string
  detectedName: string
  cadence: Cadence
  /** normalized merchant of a detected series, to start a manual rule from */
  merchant: string
  transactionIds: string[]
  /** current amount, to start an amount range around */
  latestAmount: number
  /** set on a manual series (ENG-71): edit and remove instead of confirm / dismiss / rename */
  manual?: ManualInfo
}

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

/** Confirm / dismiss / rename controls for one recurring series. Saves, then refreshes the server page. */
export function SeriesActions(props: SeriesActionsProps) {
  if (props.manual) return <ManualActions {...props} manual={props.manual} />
  return <DetectedActions {...props} />
}

/**
 * The editor sheet for a series: edits a manual one, or starts a manual rule that
 * takes over a detected one (its transactions move to the rule).
 */
function RuleSheet({ open, onOpenChange, props }: { open: boolean; onOpenChange: (o: boolean) => void; props: SeriesActionsProps }) {
  const { manual, accountId } = props
  if (!accountId) return null
  const pattern = manual ? manual.pattern : normalizePattern(props.merchant)
  const initial: ManualDraft = {
    name: props.name,
    cadence: isManualCadence(props.cadence) ? props.cadence : 'monthly',
    pattern,
    dayFrom: manual?.dayFrom ?? null,
    dayTo: manual?.dayTo ?? null,
    amountMin: manual?.amountMin ?? null,
    amountMax: manual?.amountMax ?? null,
    // a merchant made only of numbers gives no rule: keep the detected rows by hand
    attachedIds: manual ? manual.attachedIds : pattern ? [] : props.transactionIds,
    detachedIds: manual?.detachedIds ?? [],
  }
  return (
    <RecurringSheet open={open} onOpenChange={onOpenChange} title={manual ? 'עריכת חיוב קבוע' : 'כלל ידני לחיוב'}>
      <ManualSeriesForm
        accountId={accountId}
        seriesId={manual?.id}
        initial={initial}
        amountHint={props.latestAmount || undefined}
        replaceOverrideKeys={manual ? undefined : [props.seriesKey, ...(props.overrideKey ? [props.overrideKey] : [])]}
        onDone={() => onOpenChange(false)}
        onCancel={() => onOpenChange(false)}
      />
    </RecurringSheet>
  )
}

function ManualActions(props: SeriesActionsProps & { manual: ManualInfo }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)
  const { confirm, dialog } = useConfirm()

  async function remove() {
    const ok = await confirm({
      title: `להסיר את "${props.name}"?`,
      description: 'התנועות עצמן נשארות. הן רק לא ייספרו יותר כחיוב קבוע, אלא אם זוהו כך אוטומטית.',
      confirmLabel: 'הסר',
    })
    if (!ok) return
    setError(false)
    const res = await fetch(`/api/recurring/manual/${props.manual.id}`, { method: 'DELETE' })
    if (!res.ok) return setError(true)
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex items-center gap-0.5" aria-busy={pending}>
      {error && <span className="me-1 text-xs text-[hsl(var(--expense))]">ההסרה נכשלה</span>}
      <button type="button" className={iconButton} aria-label="ערוך חיוב קבוע" title="ערוך" disabled={pending} onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" className={iconButton} aria-label="הסר חיוב קבוע" title="הסר" disabled={pending} onClick={remove}>
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
      <RuleSheet open={open} onOpenChange={setOpen} props={props} />
      {dialog}
    </div>
  )
}

function DetectedActions(props: SeriesActionsProps) {
  const { seriesKey, baseKey, accountId, overrideKey, status, name, detectedName } = props
  const [ruleOpen, setRuleOpen] = useState(false)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState(false)

  async function save(patch: { status?: SeriesActionsProps['status']; displayName?: string | null }) {
    setError(false)
    const res = await fetch('/api/recurring/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: seriesKey, baseKey, accountId, overrideKey, ...patch }),
    })
    if (!res.ok) { setError(true); return }
    startTransition(() => router.refresh())
  }

  function submitRename() {
    if (editing === null) return
    const value = editing.trim()
    setEditing(null)
    if (value === name) return
    save({ displayName: value && value !== detectedName ? value : null })
  }

  if (editing !== null) {
    return (
      <form
        className="flex w-full items-center gap-1 sm:w-auto"
        onSubmit={e => { e.preventDefault(); submitRename() }}
      >
        <input
          autoFocus
          aria-label="שם חדש"
          placeholder={detectedName}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-44"
          value={editing}
          onChange={e => setEditing(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(null) }}
        />
        <button type="submit" className={iconButton} aria-label="שמור שם">
          <Check className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={iconButton} aria-label="בטל עריכה" onClick={() => setEditing(null)}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-0.5" aria-busy={pending}>
      {error && <span className="me-1 text-xs text-[hsl(var(--expense))]">השמירה נכשלה</span>}
      {status === 'dismissed' ? (
        <button
          type="button"
          className={cn(iconButton, 'w-auto gap-1 px-2 text-xs')}
          disabled={pending}
          onClick={() => save({ status: null })}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          שחזר
        </button>
      ) : (
        <>
          <button
            type="button"
            className={cn(iconButton, status === 'confirmed' && 'bg-[hsl(var(--income)/0.12)] text-[hsl(var(--income))]')}
            aria-label={status === 'confirmed' ? 'בטל אישור' : 'אשר שזה חיוב קבוע'}
            aria-pressed={status === 'confirmed'}
            title={status === 'confirmed' ? 'בטל אישור' : 'אשר'}
            disabled={pending}
            onClick={() => save({ status: status === 'confirmed' ? null : 'confirmed' })}
          >
            <Check className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label="הסתר — זה לא חיוב קבוע"
            title="הסתר"
            disabled={pending}
            onClick={() => save({ status: 'dismissed' })}
          >
            <EyeOff className="h-4 w-4" aria-hidden />
          </button>
        </>
      )}
      <button
        type="button"
        className={iconButton}
        aria-label="שנה שם"
        title="שנה שם"
        disabled={pending}
        onClick={() => setEditing(name)}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      {accountId && status !== 'dismissed' && (
        <button
          type="button"
          className={iconButton}
          aria-label="הגדר כלל ידני: גם כשהסכום משתנה"
          title="כלל ידני"
          disabled={pending}
          onClick={() => setRuleOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
        </button>
      )}
      <RuleSheet open={ruleOpen} onOpenChange={setRuleOpen} props={props} />
    </div>
  )
}
