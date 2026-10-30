'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AppDialog } from '@/components/ui/app-dialog'
import { UNCATEGORIZED } from '@/lib/insights/bank-categories'

export interface PickerCategory {
  name: string
  /** Its chart colour, when it has one */
  color?: string
}

export interface PickerScope {
  id: string
  title: string
  sub: string
}

const NO_COLOR = 'hsl(var(--muted-foreground) / 0.35)'

/** A table row's category: a pill that opens the picker (no dropdown in the row) */
export function CategoryPill({ name, color, onClick, className }: {
  /** null = uncategorised */
  name: string | null
  color?: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex h-7 max-w-40 items-center gap-1.5 rounded-full px-2.5 text-xs transition-[background-color,transform] duration-fast hover:bg-muted active:scale-[0.97]',
        name ? 'bg-muted/60' : 'border border-dashed text-muted-foreground',
        className
      )}
    >
      {name && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? NO_COLOR }} aria-hidden />}
      <bdi className="truncate">{name ?? UNCATEGORIZED}</bdi>
      <ChevronDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
    </button>
  )
}

/**
 * The window a row's category pill opens, the same for bank and card rows: the
 * categories as pills (with a search), what to apply the choice to, and Save.
 */
export function CategoryPicker({
  open,
  onOpenChange,
  context,
  title,
  amount,
  amountTone,
  categories,
  current,
  allowNone,
  scopes,
  defaultScope,
  note,
  suggestion,
  extraAction,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** e.g. "חיוב בכרטיס מקס · 12.10.2026" */
  context: string
  title: string
  amount: string
  amountTone: 'expense' | 'income'
  categories: PickerCategory[]
  /** The row's category (null = none); undefined starts with nothing picked (several rows at once) */
  current: string | null | undefined
  /** "ללא קטגוריה" is a choice (bank rows) */
  allowNone?: boolean
  /** What the choice applies to; none = this row only, nothing to ask */
  scopes?: PickerScope[]
  defaultScope?: string
  /** Shown instead of the scopes, e.g. why a cheque is saved for this row only */
  note?: string
  suggestion?: { category: string; reason: string }
  /** A quiet extra action beside Save; gets the picked category */
  extraAction?: { label: string; onClick: (category: string | null) => void }
  onSave: (category: string | null, scope: string | null) => Promise<void> | void
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex flex-col gap-0.5">
          <span className="text-xs font-normal text-muted-foreground">{context}</span>
          <span>
            <bdi>{title}</bdi>{' '}
            <span className={cn('font-medium tabular-nums', amountTone === 'income' ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]')}>
              {amount}
            </span>
          </span>
        </span>
      }
    >
      {/* Remounted per opening, so it starts from the row's current category */}
      {open && (
        <PickerBody
          categories={categories}
          current={current}
          allowNone={allowNone}
          scopes={scopes}
          defaultScope={defaultScope}
          note={note}
          suggestion={suggestion}
          extraAction={extraAction}
          onSave={onSave}
        />
      )}
    </AppDialog>
  )
}

function PickerBody({ categories, current, allowNone, scopes, defaultScope, note, suggestion, extraAction, onSave }: {
  categories: PickerCategory[]
  current: string | null | undefined
  allowNone?: boolean
  scopes?: PickerScope[]
  defaultScope?: string
  note?: string
  suggestion?: { category: string; reason: string }
  extraAction?: { label: string; onClick: (category: string | null) => void }
  onSave: (category: string | null, scope: string | null) => Promise<void> | void
}) {
  const [picked, setPicked] = useState<string | null | undefined>(current)
  const initialScope = defaultScope ?? scopes?.[0]?.id ?? null
  const [scope, setScope] = useState<string | null>(initialScope)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const shown = useMemo(
    () => categories.filter(c => !query.trim() || c.name.includes(query.trim())),
    [categories, query]
  )
  const colorOf = (name: string) => categories.find(c => c.name === name)?.color
  // Applying the same category more widely is a change too; nothing picked yet is not
  const changed = picked !== undefined && (picked !== current || scope !== initialScope)

  async function save() {
    setSaving(true)
    try {
      if (picked !== undefined) await onSave(picked, scopes?.length ? scope : null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {suggestion && picked !== suggestion.category && (
        <button
          onClick={() => setPicked(suggestion.category)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-3.5 py-2.5 text-start text-sm transition-colors hover:bg-primary/10"
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(suggestion.category) ?? NO_COLOR }} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-semibold"><bdi>{suggestion.category}</bdi>?</span>{' '}
            <span className="text-muted-foreground">{suggestion.reason}</span>
          </span>
          <span className="font-semibold text-primary">בחר</span>
        </button>
      )}

      {categories.length > 8 && (
        <label className="relative block">
          <span className="sr-only">חיפוש קטגוריה</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            className="h-10 w-full rounded-xl border bg-background ps-9 pe-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="חיפוש קטגוריה"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
      )}

      <div role="radiogroup" aria-label="קטגוריה" className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
        {allowNone && !query && <Choice name={null} on={picked === null} onPick={() => setPicked(null)} />}
        {shown.map(c => (
          <Choice key={c.name} name={c.name} color={c.color} on={picked === c.name} onPick={() => setPicked(c.name)} />
        ))}
        {shown.length === 0 && <p className="py-2 text-sm text-muted-foreground">אין קטגוריה בשם הזה</p>}
      </div>

      {scopes && scopes.length > 0 && (
        <div role="radiogroup" aria-label="על מה להחיל" className="space-y-2">
          <p className="text-sm font-semibold">על מה להחיל</p>
          {scopes.map(s => {
            const on = scope === s.id
            return (
              <button
                key={s.id}
                role="radio"
                aria-checked={on}
                onClick={() => setScope(s.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-start transition-colors',
                  on ? 'bg-primary/5 ring-2 ring-inset ring-primary' : 'ring-1 ring-inset ring-border hover:bg-muted/40'
                )}
              >
                <span
                  aria-hidden
                  className={cn('h-[18px] w-[18px] shrink-0 rounded-full transition-[border-width]', on ? 'border-[6px] border-primary' : 'border-2 border-border')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]"><bdi>{s.title}</bdi></span>
                  <span className="block text-xs text-muted-foreground">{s.sub}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      {note && <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">{note}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!changed || saving}
          className="h-11 flex-1 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-[opacity,transform] active:scale-[0.97] disabled:opacity-40"
        >
          שמירה
        </button>
        {extraAction && (
          <button
            onClick={() => extraAction.onClick(picked ?? null)}
            className="h-11 px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {extraAction.label}
          </button>
        )}
      </div>
    </div>
  )
}

function Choice({ name, color, on, onPick }: { name: string | null; color?: string; on: boolean; onPick: () => void }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 rounded-full px-3.5 text-sm transition-[background-color,box-shadow,transform] duration-fast active:scale-[0.97]',
        on ? 'bg-primary/10 font-semibold ring-2 ring-inset ring-primary' : 'bg-muted hover:bg-muted/70'
      )}
    >
      {name ? (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? NO_COLOR }} aria-hidden />
      ) : null}
      <bdi>{name ?? UNCATEGORIZED}</bdi>
    </button>
  )
}
