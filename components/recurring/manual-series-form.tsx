'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AppDialog } from '@/components/ui/app-dialog'
import { ArrowUp, Loader2, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { rangeAround, type ManualCadence } from '@/lib/insights/manual-recurring'

/** Everything a manual series is made of, as the form edits it */
export interface ManualDraft {
  name: string
  cadence: ManualCadence
  pattern: string
  dayFrom: number | null
  dayTo: number | null
  /** optional amount range in ₪, inclusive; either end may be open */
  amountMin: number | null
  amountMax: number | null
  attachedIds: string[]
  detachedIds: string[]
}

interface PreviewRow {
  id: string
  date: string
  description: string
  amount: number
  state: 'rule' | 'attached' | 'detached' | 'other'
  from?: string
}

interface Preview {
  rows: PreviewRow[]
  more: number
  occurrences: number
  latestAmount: number
  monthlyAmount: number
  priceIncrease: { from: number; to: number; since: string } | null
}

export const CADENCE_OPTIONS: { value: ManualCadence; label: string; per: string }[] = [
  { value: 'monthly', label: 'חודשי', per: 'בחודש' },
  { value: 'bimonthly', label: 'דו-חודשי', per: 'לחודשיים' },
  { value: 'yearly', label: 'שנתי', per: 'בשנה' },
]

const input =
  'h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
const BUTTON =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium transition-[background-color,transform] duration-quick ease-ui active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
export const SHEET_BUTTON = BUTTON
const badge = 'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium'

/** The window every manual-series flow opens in: the app's window (AppDialog) */
export function RecurringSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="mt-4">{children}</div>
    </AppDialog>
  )
}

const without = (ids: string[], id: string) => ids.filter(x => x !== id)

const fmtAmount = (n: number | null) => (n == null ? '' : String(n))

/** '' -> null (open end); a number -> it; anything else -> undefined (keep the last valid value) */
function parseAmount(text: string): number | null | undefined {
  const t = text.replace(/[₪,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * Name, cadence and rule of a manual series, with the matching transactions shown
 * live before saving. Creates (no `seriesId`) or edits; refreshes the page when done.
 */
export function ManualSeriesForm({
  accountId,
  seriesId,
  initial,
  dayHint,
  amountHint,
  replaceOverrideKeys,
  onDone,
  onCancel,
}: {
  accountId: string
  seriesId?: string
  initial: ManualDraft
  /** day of month to start a new window around (the marked transaction's day) */
  dayHint?: number
  /** amount to start a range around (the marked row's, or the series' current one) */
  amountHint?: number
  /** override keys of a detected series this one takes over */
  replaceOverrideKeys?: string[]
  onDone: () => void
  onCancel: () => void
}) {
  const id = useId()
  const router = useRouter()
  const { confirm, dialog } = useConfirm()
  const [draft, setDraft] = useState<ManualDraft>(initial)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const windowOn = draft.dayFrom != null && draft.dayTo != null
  // The amount fields keep what is typed (a half-typed number); the draft gets numbers
  const [amountText, setAmountText] = useState({ min: fmtAmount(initial.amountMin), max: fmtAmount(initial.amountMax) })
  const [rangeOn, setRangeOn] = useState(initial.amountMin != null || initial.amountMax != null)
  const set = (patch: Partial<ManualDraft>) => setDraft(d => ({ ...d, ...patch }))

  // Live preview: debounced, the latest request wins
  const seq = useRef(0)
  const { cadence, pattern, dayFrom, dayTo, amountMin, amountMax, attachedIds, detachedIds } = draft
  const previewKey = JSON.stringify({ cadence, pattern, dayFrom, dayTo, amountMin, amountMax, attachedIds, detachedIds })
  useEffect(() => {
    const n = ++seq.current
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/recurring/manual/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, seriesId, ...JSON.parse(previewKey) }),
        })
        if (n !== seq.current) return
        if (res.ok) setPreview(await res.json())
      } finally {
        if (n === seq.current) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [accountId, seriesId, previewKey])

  function toggleRow(row: PreviewRow) {
    if (row.state === 'detached') set({ detachedIds: without(detachedIds, row.id) })
    else if (row.state === 'other') set({ attachedIds: [...without(attachedIds, row.id), row.id], detachedIds: without(detachedIds, row.id) })
    else if (row.state === 'attached') set({ attachedIds: without(attachedIds, row.id) })
    else set({ attachedIds: without(attachedIds, row.id), detachedIds: [...without(detachedIds, row.id), row.id] })
  }

  function setWindow(on: boolean) {
    if (!on) return set({ dayFrom: null, dayTo: null })
    const d = dayHint ?? 1
    set({ dayFrom: Math.max(1, d - 3), dayTo: Math.min(31, d + 3) })
  }

  function setRange(r: { amountMin: number | null; amountMax: number | null } | null) {
    setRangeOn(!!r)
    setAmountText({ min: fmtAmount(r?.amountMin ?? null), max: fmtAmount(r?.amountMax ?? null) })
    set({ amountMin: r?.amountMin ?? null, amountMax: r?.amountMax ?? null })
  }

  function typeAmount(end: 'min' | 'max', text: string) {
    setAmountText(t => ({ ...t, [end]: text }))
    const n = parseAmount(text)
    if (n !== undefined) set(end === 'min' ? { amountMin: n } : { amountMax: n })
  }

  const rangeInvalid = rangeOn && amountMin != null && amountMax != null && amountMin > amountMax

  const dayValue = (v: string) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : 1
  }

  async function save() {
    if (!draft.name.trim()) return setError('צריך לתת שם')
    if (rangeInvalid) return setError('הסכום המינימלי גדול מהמקסימלי')
    setSaving(true)
    setError(null)
    const res = await fetch(seriesId ? `/api/recurring/manual/${seriesId}` : '/api/recurring/manual', {
      method: seriesId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, ...draft, ...(replaceOverrideKeys ? { replaceOverrideKeys } : {}) }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return setError(body?.error ?? 'השמירה נכשלה')
    }
    router.refresh()
    onDone()
  }

  async function remove() {
    if (!seriesId) return
    const ok = await confirm({
      title: `להסיר את "${draft.name}"?`,
      description: 'התנועות עצמן נשארות. הן רק לא ייספרו יותר כחיוב קבוע, אלא אם זוהו כך אוטומטית.',
      confirmLabel: 'הסר',
    })
    if (!ok) return
    setSaving(true)
    const res = await fetch(`/api/recurring/manual/${seriesId}`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) return setError('ההסרה נכשלה')
    router.refresh()
    onDone()
  }

  const per = CADENCE_OPTIONS.find(c => c.value === cadence)!.per
  const shown = preview?.rows ?? []

  return (
    <form
      className="space-y-5"
      onSubmit={e => {
        e.preventDefault()
        // the confirmation sheet has its own form; don't let it submit this one
        if (e.target === e.currentTarget) save()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">שם</label>
          <input
            id={`${id}-name`}
            className={input}
            value={draft.name}
            maxLength={80}
            onChange={e => set({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <span id={`${id}-cadence`} className="text-sm font-medium">תדירות</span>
          <div role="radiogroup" aria-labelledby={`${id}-cadence`} className="flex gap-1 rounded-lg border bg-muted/50 p-1">
            {CADENCE_OPTIONS.map(c => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={cadence === c.value}
                onClick={() => set({ cadence: c.value })}
                className={cn(
                  'flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  cadence === c.value ? 'bg-card font-medium text-foreground shadow-e1' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div role="group" aria-label="אילו תנועות נכללות" className="space-y-3 rounded-2xl bg-muted/40 p-3 sm:p-4">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-pattern`} className="text-sm font-medium">התיאור מכיל</label>
          <input
            id={`${id}-pattern`}
            className={input}
            value={draft.pattern}
            maxLength={120}
            dir="auto"
            onChange={e => set({ pattern: e.target.value })}
          />
          <p className="text-xs text-muted-foreground text-pretty">
            {draft.pattern.trim()
              ? 'מספרים, כמו מספר שיק או אסמכתה, לא נלקחים בחשבון. הסכום יכול להשתנות.'
              : 'בלי תיאור נכללות רק תנועות שצורפו ידנית.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={windowOn}
              onChange={e => setWindow(e.target.checked)}
            />
            רק בימים
          </label>
          {windowOn && (
            <span className="flex items-center gap-2 text-sm">
              <input
                aria-label="מיום"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                className={cn(input, 'h-9 w-16 text-center tabular-nums')}
                value={draft.dayFrom ?? ''}
                onChange={e => set({ dayFrom: dayValue(e.target.value) })}
              />
              <span className="text-muted-foreground">עד</span>
              <input
                aria-label="עד יום"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                className={cn(input, 'h-9 w-16 text-center tabular-nums')}
                value={draft.dayTo ?? ''}
                onChange={e => set({ dayTo: dayValue(e.target.value) })}
              />
              <span className="text-muted-foreground">בחודש</span>
            </span>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={rangeOn}
                onChange={e => setRange(e.target.checked ? (amountHint ? rangeAround(amountHint, 25) : { amountMin: null, amountMax: null }) : null)}
              />
              רק בסכומים
            </label>
            {rangeOn && (
              <span className="flex items-center gap-2 text-sm">
                <input
                  aria-label="מסכום"
                  inputMode="decimal"
                  placeholder="ללא"
                  className={cn(input, 'h-9 w-24 text-center tabular-nums', rangeInvalid && 'border-destructive')}
                  value={amountText.min}
                  onChange={e => typeAmount('min', e.target.value)}
                />
                <span className="text-muted-foreground">עד</span>
                <input
                  aria-label="עד סכום"
                  inputMode="decimal"
                  placeholder="ללא"
                  className={cn(input, 'h-9 w-24 text-center tabular-nums', rangeInvalid && 'border-destructive')}
                  value={amountText.max}
                  onChange={e => typeAmount('max', e.target.value)}
                />
                <span className="text-muted-foreground">₪</span>
              </span>
            )}
          </div>
          {amountHint ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">
                סביב <span className="tabular-nums">{formatCurrency(amountHint)}</span>:
              </span>
              {[10, 25, 50].map(pct => {
                const r = rangeAround(amountHint, pct)
                const on = rangeOn && amountMin === r.amountMin && amountMax === r.amountMax
                return (
                  <button
                    key={pct}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRange(r)}
                    className={cn(
                      'rounded-md px-2 py-1 font-medium tabular-nums transition-[background-color,color,transform] duration-quick ease-ui active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground shadow-e1 hover:bg-muted'
                    )}
                  >
                    ±{pct}%
                  </button>
                )
              })}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground text-pretty">
            טווח סכומים מפריד בין חיובים עם אותו תיאור, למשל שני סוגי שיקים. כדאי שיהיה רחב מספיק לשינוי מחיר צפוי.
          </p>
        </div>
      </div>

      <section aria-live="polite" aria-busy={loading} className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-medium">
            {preview ? `${preview.occurrences} תנועות תואמות` : 'תנועות תואמות'}
            {loading && <Loader2 className="ms-1.5 inline h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
          </h3>
          {preview && preview.occurrences > 0 && (
            <div className="flex items-center gap-1.5 text-sm tabular-nums">
              {preview.priceIncrease && (
                <span
                  className={cn(badge, 'bg-[hsl(var(--expense)/0.12)] text-[hsl(var(--expense))]')}
                  title={`עלה מ-${formatCurrency(preview.priceIncrease.from)} החל מ-${formatDate(preview.priceIncrease.since)}`}
                >
                  <ArrowUp className="h-3 w-3" aria-hidden />
                  התייקר מ-{formatCurrency(preview.priceIncrease.from)}
                </span>
              )}
              <span className="font-semibold">{formatCurrency(preview.latestAmount)}</span>
              <span className="text-muted-foreground">{per}</span>
            </div>
          )}
        </div>

        {preview && shown.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground text-pretty">
            אף תנועה לא תואמת. נסו תיאור קצר יותר או טווח ימים רחב יותר.
          </p>
        ) : (
          // its own scroll, so the buttons stay in reach with many matches
          <ul
            className={cn(
              'max-h-[min(18rem,38dvh)] divide-y divide-border/60 overflow-y-auto overscroll-contain rounded-xl border transition-opacity duration-fast',
              loading && preview && 'opacity-60'
            )}
          >
            {!preview &&
              Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="h-3 w-16 animate-pulse rounded bg-muted" />
                  <span className="h-3 flex-1 animate-pulse rounded bg-muted" />
                  <span className="h-3 w-12 animate-pulse rounded bg-muted" />
                </li>
              ))}
            {shown.map(row => {
              const out = row.state === 'detached' || row.state === 'other'
              return (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={cn('w-[5.5rem] shrink-0 text-xs tabular-nums text-muted-foreground', out && 'opacity-60')}>
                    {formatDate(row.date)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate', out && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
                      {row.description}
                    </span>
                    {(row.state === 'attached' || row.state === 'other' || row.from) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.state === 'attached' && 'צורפה ידנית'}
                        {row.state === 'other' && `בחיוב "${row.from}"`}
                        {row.state !== 'other' && row.from && `${row.state === 'attached' ? ' · ' : ''}עוברת מ"${row.from}"`}
                      </span>
                    )}
                  </span>
                  <span className={cn('shrink-0 font-medium tabular-nums', out && 'text-muted-foreground')}>{formatCurrency(row.amount)}</span>
                  <button
                    type="button"
                    onClick={() => toggleRow(row)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.state === 'detached' ? 'החזר' : row.state === 'other' ? 'העבר לכאן' : 'הוצא'}
                  </button>
                </li>
              )
            })}
            {preview && preview.more > 0 && (
              <li className="px-3 py-2 text-center text-xs text-muted-foreground">ועוד {preview.more} תנועות</li>
            )}
          </ul>
        )}
      </section>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap-reverse items-center gap-2 sm:flex-nowrap">
        {seriesId && (
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className={cn(BUTTON, 'px-3 text-destructive hover:bg-destructive/10 sm:me-auto')}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            הסר חיוב
          </button>
        )}
        <div className={cn('grid flex-1 grid-cols-2 gap-2', seriesId && 'sm:max-w-xs')}>
          <button type="button" onClick={onCancel} className={cn(BUTTON, 'bg-muted text-foreground hover:bg-muted/70')}>
            ביטול
          </button>
          <button type="submit" disabled={saving} className={cn(BUTTON, 'bg-primary text-primary-foreground hover:bg-primary/90')}>
            {saving ? 'שומר…' : seriesId ? 'שמור' : 'סמן כחיוב קבוע'}
          </button>
        </div>
      </div>
      {dialog}
    </form>
  )
}
