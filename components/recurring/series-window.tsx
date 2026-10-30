'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, ChevronLeft, EyeOff, Pencil, SlidersHorizontal, Trash2, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'
import { AppDialog } from '@/components/ui/app-dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { isManualCadence, normalizePattern } from '@/lib/insights/manual-recurring'
import type { AppliedSeries } from '@/lib/insights/recurring-overrides'
import { ManualSeriesForm, RecurringSheet, type ManualDraft } from './manual-series-form'

/**
 * A recurring series' row on /recurring: the whole row opens the app's window with
 * the series and its actions as labelled rows (confirm, rename, a manual rule, hide;
 * or for a manual series: edit, remove), instead of a cluster of icons on the row.
 */
export function SeriesRow({ series, children }: { series: AppliedSeries; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 text-start transition-colors hover:bg-muted/50 active:bg-muted/70"
      >
        {children}
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
      </button>
      <AppDialog open={open} onOpenChange={setOpen} title={series.name}>
        {open && <SeriesWindow series={series} onClose={() => setOpen(false)} />}
      </AppDialog>
    </>
  )
}

const CADENCE: Record<string, string> = { weekly: 'שבועי', monthly: 'חודשי', bimonthly: 'דו-חודשי', yearly: 'שנתי' }

function SeriesWindow({ series, onClose }: { series: AppliedSeries; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const { status, manual, accountId } = series

  function done() {
    onClose()
    startTransition(() => router.refresh())
  }

  async function save(patch: { status?: AppliedSeries['status']; displayName?: string | null }) {
    setError(null)
    const res = await fetch('/api/recurring/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: series.key, baseKey: series.baseKey, accountId, overrideKey: series.overrideKey, ...patch }),
    })
    if (!res.ok) return setError('השמירה נכשלה')
    done()
  }

  function rename() {
    if (renaming === null) return
    const value = renaming.trim()
    if (value === series.name) return setRenaming(null)
    save({ displayName: value && value !== series.detectedName ? value : null })
  }

  async function removeManual() {
    if (!manual) return
    const ok = await confirm({
      title: `להסיר את "${series.name}"?`,
      description: 'התנועות עצמן נשארות. הן רק לא ייספרו יותר כחיוב קבוע, אלא אם זוהו כך אוטומטית.',
      confirmLabel: 'הסר',
    })
    if (!ok) return
    setError(null)
    const res = await fetch(`/api/recurring/manual/${manual.id}`, { method: 'DELETE' })
    if (!res.ok) return setError('ההסרה נכשלה')
    done()
  }

  return (
    <div className="mt-1 space-y-4" aria-busy={pending}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {CADENCE[series.cadence] ?? ''}
          {series.occurrences > 0 && <> · {series.occurrences} חיובים · אחרון {formatDate(series.lastDate)}</>}
          {series.active && series.occurrences > 0 && <> · הבא בערך {formatDate(series.nextDate)}</>}
        </p>
        <span className="shrink-0 text-lg font-semibold tabular-nums">{formatCurrency(series.latestAmount)}</span>
      </div>
      {status === 'confirmed' && (
        <p className="flex items-center gap-1.5 text-sm text-[hsl(var(--income))]">
          <BadgeCheck className="h-4 w-4" aria-hidden /> אישרת שזה חיוב קבוע
        </p>
      )}

      {renaming !== null ? (
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); rename() }}>
          <input
            autoFocus
            aria-label="שם חדש"
            placeholder={series.detectedName}
            className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
            value={renaming}
            onChange={e => setRenaming(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setRenaming(null) }}
          />
          <button type="submit" className="h-11 rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-transform active:scale-[0.97]">שמירה</button>
          <button type="button" aria-label="ביטול" onClick={() => setRenaming(null)} className="h-11 rounded-xl bg-muted px-3">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </form>
      ) : (
        <ul className="overflow-hidden rounded-xl bg-muted/40 divide-y divide-border/60">
          {manual ? (
            <>
              <Action icon={<Pencil className="h-4 w-4" />} title="עריכת הכלל" sub="שם, תדירות, תיאור, ימים וסכומים" onClick={() => setRuleOpen(true)} />
              <Action icon={<Trash2 className="h-4 w-4" />} title="הסרה" sub="התנועות נשארות, רק לא נספרות כחיוב קבוע" tone="danger" onClick={removeManual} />
            </>
          ) : status === 'dismissed' ? (
            <Action icon={<Undo2 className="h-4 w-4" />} title="שחזור" sub="יחזור להיספר בחיובים הקבועים" onClick={() => save({ status: null })} />
          ) : (
            <>
              <Action
                icon={<BadgeCheck className="h-4 w-4" />}
                title={status === 'confirmed' ? 'ביטול האישור' : 'אישור: זה חיוב קבוע'}
                sub={status === 'confirmed' ? 'יחזור להיות חיוב שזוהה אוטומטית' : 'יסומן כמאושר ברשימה'}
                tone={status === 'confirmed' ? undefined : 'positive'}
                onClick={() => save({ status: status === 'confirmed' ? null : 'confirmed' })}
              />
              <Action icon={<Pencil className="h-4 w-4" />} title="שינוי שם" sub={series.detectedName !== series.name ? `בקובץ: ${series.detectedName}` : 'שם ברור יותר מזה שבקובץ'} onClick={() => setRenaming(series.name)} />
              {accountId && (
                <Action icon={<SlidersHorizontal className="h-4 w-4" />} title="כלל ידני" sub="גם כשהסכום או היום משתנים" onClick={() => setRuleOpen(true)} />
              )}
              <Action icon={<EyeOff className="h-4 w-4" />} title="הסתרה: זה לא חיוב קבוע" sub="לא ייספר בסך הכול; אפשר לשחזר" tone="danger" onClick={() => save({ status: 'dismissed' })} />
            </>
          )}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <RuleSheet open={ruleOpen} onOpenChange={o => { setRuleOpen(o); if (!o) onClose() }} series={series} />
      {dialog}
    </div>
  )
}

function Action({ icon, title, sub, tone, onClick }: {
  icon: ReactNode
  title: string
  sub: string
  tone?: 'positive' | 'danger'
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2 text-start transition-colors hover:bg-muted"
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            tone === 'positive' ? 'bg-[hsl(var(--income)/0.12)] text-[hsl(var(--income))]' : tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
          )}
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[15px]', tone === 'danger' && 'text-destructive')}>{title}</span>
          <span className="block text-xs text-muted-foreground">{sub}</span>
        </span>
      </button>
    </li>
  )
}

/**
 * The editor sheet for a series: edits a manual one, or starts a manual rule that
 * takes over a detected one (its transactions move to the rule).
 */
function RuleSheet({ open, onOpenChange, series }: { open: boolean; onOpenChange: (o: boolean) => void; series: AppliedSeries }) {
  const { manual, accountId } = series
  if (!accountId) return null
  const pattern = manual ? manual.pattern : normalizePattern(series.merchant)
  const initial: ManualDraft = {
    name: series.name,
    cadence: isManualCadence(series.cadence) ? series.cadence : 'monthly',
    pattern,
    dayFrom: manual?.dayFrom ?? null,
    dayTo: manual?.dayTo ?? null,
    amountMin: manual?.amountMin ?? null,
    amountMax: manual?.amountMax ?? null,
    // a merchant made only of numbers gives no rule: keep the detected rows by hand
    attachedIds: manual ? manual.attachedIds : pattern ? [] : series.transactionIds,
    detachedIds: manual?.detachedIds ?? [],
  }
  return (
    <RecurringSheet open={open} onOpenChange={onOpenChange} title={manual ? 'עריכת חיוב קבוע' : 'כלל ידני לחיוב'}>
      <ManualSeriesForm
        accountId={accountId}
        seriesId={manual?.id}
        initial={initial}
        amountHint={series.latestAmount || undefined}
        replaceOverrideKeys={manual ? undefined : [series.key, ...(series.overrideKey ? [series.overrideKey] : [])]}
        onDone={() => onOpenChange(false)}
        onCancel={() => onOpenChange(false)}
      />
    </RecurringSheet>
  )
}
