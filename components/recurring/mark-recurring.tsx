'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Plus, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'
import { isManualCadence, type ManualCadence, type ManualInfo } from '@/lib/insights/manual-recurring'
import type { Cadence } from '@/lib/insights/recurring'
import { CADENCE_OPTIONS, ManualSeriesForm, RecurringSheet, SHEET_BUTTON, type ManualDraft } from './manual-series-form'

interface Info {
  transaction: {
    id: string
    accountId: string
    date: string
    description: string
    amount: number
    suggestion: { name: string; pattern: string; cadence: ManualCadence }
  }
  series: {
    key: string
    baseKey: string
    overrideKey: string | null
    accountId: string | null
    name: string
    status: 'confirmed' | 'dismissed' | null
    cadence: Cadence
    latestAmount: number
    occurrences: number
    manualId: string | null
    manual: ManualInfo | null
  } | null
  manualSeries: { id: string; name: string; cadence: Cadence; latestAmount: number; occurrences: number }[]
}

type View = { kind: 'loading' } | { kind: 'error' } | { kind: 'choose'; info: Info } | { kind: 'form'; info: Info; seed: 'new' | 'takeover' | 'edit' }

const CADENCE_WORD: Record<Cadence, string> = { weekly: 'שבועי', monthly: 'חודשי', bimonthly: 'דו-חודשי', yearly: 'שנתי' }

const iconButton =
  'inline-flex h-7 w-7 items-center justify-center rounded-md transition-[background-color,color,transform] duration-quick ease-ui hover:bg-muted active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * "סמן כחיוב קבוע" on a transaction row (ENG-71). Opens a sheet that, depending on the
 * transaction, confirms the detected series it is in, edits the manual series it is in,
 * adds it to a manual series of the same account, or starts a new one from it.
 */
export function MarkRecurringButton({
  source,
  transactionId,
  seriesName,
  variant = 'icon',
  className,
}: {
  source: 'bank' | 'card'
  transactionId: string
  /** name of the recurring series the row is in, when known: the icon shows it */
  seriesName?: string
  /** `label`: the series name as a small chip (a manual series' fixed row label) */
  variant?: 'icon' | 'label'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>({ kind: 'loading' })

  async function start() {
    setOpen(true)
    setView({ kind: 'loading' })
    const res = await fetch(`/api/recurring/transaction?source=${source}&id=${encodeURIComponent(transactionId)}`)
    if (!res.ok) return setView({ kind: 'error' })
    const info: Info = await res.json()
    const s = info.series
    // Not in any kept series and nothing to pick from: straight to the form (two taps)
    if ((!s || s.status === 'dismissed') && info.manualSeries.length === 0) setView({ kind: 'form', info, seed: 'new' })
    else setView({ kind: 'choose', info })
  }

  const label = seriesName ? `חיוב קבוע: ${seriesName}` : 'סמן כחיוב קבוע'
  return (
    <>
      {variant === 'label' && seriesName ? (
        <button
          type="button"
          onClick={start}
          title={label}
          className={cn(
            'inline-flex max-w-[9rem] items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-[11px] font-medium leading-4 text-primary',
            'transition-[background-color,transform] duration-quick ease-ui hover:bg-primary/15 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'dark:bg-primary/15 dark:hover:bg-primary/25',
            className
          )}
        >
          <Repeat className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{seriesName}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          aria-label={label}
          title={label}
          className={cn(iconButton, seriesName ? 'text-primary' : 'text-muted-foreground hover:text-foreground', className)}
        >
          <Repeat className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <RecurringSheet
        open={open}
        onOpenChange={setOpen}
        title={view.kind === 'form' && view.seed === 'edit' ? 'עריכת חיוב קבוע' : 'סימון כחיוב קבוע'}
      >
        <SheetBody view={view} setView={setView} close={() => setOpen(false)} />
      </RecurringSheet>
    </>
  )
}

function seedFor(info: Info, seed: 'new' | 'takeover' | 'edit'): ManualDraft {
  const t = info.transaction
  const s = info.series
  if (seed === 'edit' && s?.manual) {
    return {
      name: s.name,
      cadence: isManualCadence(s.cadence) ? s.cadence : 'monthly',
      pattern: s.manual.pattern,
      dayFrom: s.manual.dayFrom,
      dayTo: s.manual.dayTo,
      amountMin: s.manual.amountMin,
      amountMax: s.manual.amountMax,
      attachedIds: s.manual.attachedIds,
      detachedIds: s.manual.detachedIds,
    }
  }
  return {
    name: seed === 'takeover' && s ? s.name : t.suggestion.name,
    cadence: seed === 'takeover' && s && isManualCadence(s.cadence) ? s.cadence : t.suggestion.cadence,
    pattern: t.suggestion.pattern,
    dayFrom: null,
    dayTo: null,
    amountMin: null,
    amountMax: null,
    attachedIds: [t.id],
    detachedIds: [],
  }
}

function SheetBody({ view, setView, close }: { view: View; setView: (v: View) => void; close: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(url: string, body: unknown) {
    setBusy(true)
    setError(null)
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (!res.ok) return setError('השמירה נכשלה')
    router.refresh()
    close()
  }

  if (view.kind === 'loading') {
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <div className="h-11 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }
  if (view.kind === 'error') return <p className="text-sm text-destructive">לא הצלחנו לטעון את העסקה.</p>

  const { info } = view
  const t = info.transaction
  if (view.kind === 'form') {
    const s = info.series
    return (
      <ManualSeriesForm
        accountId={t.accountId}
        seriesId={view.seed === 'edit' ? (s?.manualId ?? undefined) : undefined}
        initial={seedFor(info, view.seed)}
        dayHint={Number(t.date.slice(8, 10))}
        amountHint={t.amount}
        replaceOverrideKeys={view.seed === 'takeover' && s ? [s.key, ...(s.overrideKey ? [s.overrideKey] : [])] : undefined}
        onDone={close}
        onCancel={close}
      />
    )
  }

  const s = info.series && info.series.status !== 'dismissed' ? info.series : null
  const others = info.manualSeries.filter(m => m.id !== s?.manualId)
  const txLine = (
    <p className="text-sm text-muted-foreground">
      <span className="text-foreground">{t.description}</span> · {formatDate(t.date)} · <span className="tabular-nums">{formatCurrency(t.amount)}</span>
    </p>
  )

  return (
    <div className="space-y-5">
      {txLine}

      {s && (
        <div className="rounded-2xl bg-muted/50 p-4">
          <p className="text-xs text-muted-foreground">{s.manual ? 'העסקה בחיוב הקבוע' : 'זוהתה כחלק מחיוב קבוע'}</p>
          <p className="mt-0.5 flex items-center gap-1.5 font-medium">
            {s.name}
            {s.manual && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">ידני</span>}
            {s.status === 'confirmed' && <BadgeCheck className="h-4 w-4 text-[hsl(var(--income))]" aria-label="מאושר" />}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {CADENCE_WORD[s.cadence]} · {s.occurrences} חיובים · {formatCurrency(s.latestAmount)}
          </p>
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{s ? 'להעביר לחיוב אחר?' : 'להוסיף לחיוב קבוע קיים?'}</p>
          <ul className="space-y-1.5">
            {others.map(m => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send(`/api/recurring/manual/${m.id}/members`, { transactionId: t.id, mode: 'attach' })}
                  className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition-[background-color,transform] duration-quick ease-ui hover:bg-muted/60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {CADENCE_OPTIONS.find(c => c.value === m.cadence)?.label} · {formatCurrency(m.latestAmount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        {s?.manual ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => send(`/api/recurring/manual/${s.manualId}/members`, { transactionId: t.id, mode: 'detach' })}
              className={cn(SHEET_BUTTON, 'bg-muted text-foreground hover:bg-muted/70')}
            >
              הוצא מהחיוב
            </button>
            <button
              type="button"
              onClick={() => setView({ kind: 'form', info, seed: 'edit' })}
              className={cn(SHEET_BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}
            >
              ערוך חיוב
            </button>
          </>
        ) : s ? (
          <>
            <button
              type="button"
              onClick={() => setView({ kind: 'form', info, seed: 'takeover' })}
              className={cn(SHEET_BUTTON, 'bg-muted text-foreground hover:bg-muted/70')}
            >
              הגדר כלל ידני
            </button>
            {s.status === 'confirmed' ? (
              <button type="button" onClick={close} className={cn(SHEET_BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}>
                סגור
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  send('/api/recurring/overrides', {
                    key: s.key,
                    baseKey: s.baseKey,
                    accountId: s.accountId,
                    overrideKey: s.overrideKey,
                    status: 'confirmed',
                  })
                }
                className={cn(SHEET_BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}
              >
                אשר חיוב קבוע
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={close} className={cn(SHEET_BUTTON, 'bg-muted text-foreground hover:bg-muted/70')}>
              ביטול
            </button>
            <button
              type="button"
              onClick={() => setView({ kind: 'form', info, seed: 'new' })}
              className={cn(SHEET_BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}
            >
              חיוב קבוע חדש
            </button>
          </>
        )}
      </div>
      {s && !s.manual && (
        <p className="text-xs text-muted-foreground text-pretty">
          כלל ידני תופס את כל התנועות עם אותו תיאור, גם כשהסכום משתנה הרבה, ומחליף את הזיהוי האוטומטי.
        </p>
      )}
    </div>
  )
}
