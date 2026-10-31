'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus, Search, TextSearch } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { AppDialog } from '@/components/ui/app-dialog'
import { UNCATEGORIZED } from '@/lib/insights/bank-categories'
import { normalizeKeyword, validKeyword, MIN_KEYWORD_LENGTH } from '@/lib/insights/keyword-rules'

export interface PickerCategory {
  name: string
  /** Its chart colour, when it has one */
  color?: string
}

export interface PickerScope {
  id: string
  title: string
  sub: string
  /**
   * A contains-text rule (lib/insights/keyword-rules.ts): picking this scope shows a
   * text field, pre-filled with `suggestion`, and how many rows of `kind` it reaches
   */
  contains?: { suggestion: string; kind: 'EXPENSE' | 'INCOME' }
}

/** The scope id of a contains-text rule in a row's window */
export const CONTAINS_SCOPE = 'contains'

/** The scope of a contains-text rule, for a row whose text is `text` */
export function containsScope(text: string, kind: 'EXPENSE' | 'INCOME', suggestion: string): PickerScope {
  return {
    id: CONTAINS_SCOPE,
    title: 'כל התנועות שמכילות…',
    sub: kind === 'EXPENSE'
      ? 'חיובים בכרטיס ותנועות יוצאות בבנק, גם בקבצים הבאים; מה שבחרת ידנית לא משתנה'
      : 'תנועות נכנסות בבנק, גם בקבצים הבאים; מה שבחרת ידנית לא משתנה',
    contains: { suggestion: suggestion || text, kind },
  }
}

const NO_COLOR = 'hsl(var(--muted-foreground) / 0.35)'

/** A table row's category: a pill that opens the picker (no dropdown in the row) */
export function CategoryPill({ name, color, sourceName, onClick, className }: {
  /** null = uncategorised */
  name: string | null
  color?: string
  /** An uncategorised card row's category in the issuer's file (none of yours), shown on hover */
  sourceName?: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      title={!name && sourceName ? `בקובץ: ${sourceName}` : undefined}
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
  createKind,
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
  /** The kind a category made here gets ("+ חדשה" beside the search); none = no creating */
  createKind?: 'EXPENSE' | 'INCOME'
  /** `pattern`: the text of a contains-text scope, when that is the one picked */
  onSave: (category: string | null, scope: string | null, pattern?: string) => Promise<void> | void
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
          createKind={createKind}
          onSave={onSave}
        />
      )}
    </AppDialog>
  )
}

function PickerBody({ categories: given, current, allowNone, scopes, defaultScope, note, suggestion, extraAction, createKind, onSave }: {
  categories: PickerCategory[]
  current: string | null | undefined
  allowNone?: boolean
  scopes?: PickerScope[]
  defaultScope?: string
  note?: string
  suggestion?: { category: string; reason: string }
  extraAction?: { label: string; onClick: (category: string | null) => void }
  createKind?: 'EXPENSE' | 'INCOME'
  onSave: (category: string | null, scope: string | null, pattern?: string) => Promise<void> | void
}) {
  const router = useRouter()
  // Categories made in this window join the list at once (the page refreshes behind it)
  const [made, setMade] = useState<PickerCategory[]>([])
  const categories = useMemo(() => [...given, ...made.filter(m => !given.some(g => g.name === m.name))], [given, made])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  async function create() {
    const name = newName.trim()
    if (!name || !createKind) return
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, kind: createKind }),
    })
    if (!res.ok) { setCreateError('שם כבר קיים'); return }
    setMade(prev => [...prev, { name }])
    setPicked(name)
    setNewName('')
    setCreateError(null)
    setCreating(false)
    router.refresh()
  }

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
  const contains = scopes?.find(s => s.id === scope)?.contains
  const [pattern, setPattern] = useState(() => scopes?.find(s => s.contains)?.contains?.suggestion ?? '')
  // A contains rule needs a category and enough text
  const containsReady = !contains || (picked !== null && validKeyword(pattern))
  // Applying the same category more widely is a change too; nothing picked yet is not
  const changed = picked !== undefined && (picked !== current || scope !== initialScope) && containsReady

  async function save() {
    setSaving(true)
    try {
      if (picked !== undefined) {
        await onSave(picked, scopes?.length ? scope : null, contains ? normalizeKeyword(pattern) : undefined)
      }
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

      {creating ? (
        // "+ חדשה" turns the search row into the new category's name
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              autoFocus
              aria-label="שם הקטגוריה החדשה"
              placeholder={createKind === 'INCOME' ? 'שם קטגוריית הכנסה חדשה' : 'שם קטגוריית הוצאה חדשה'}
              className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); create() }
                if (e.key === 'Escape') { e.stopPropagation(); setCreating(false); setCreateError(null) }
              }}
            />
            <button
              onClick={create}
              disabled={!newName.trim()}
              className="h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-[opacity,transform] active:scale-[0.97] disabled:opacity-40"
            >
              הוספה
            </button>
            <button
              onClick={() => { setCreating(false); setCreateError(null) }}
              className="h-10 shrink-0 rounded-xl bg-muted px-3 text-sm transition-colors hover:bg-muted/70"
            >
              ביטול
            </button>
          </div>
          {createError && <p className="text-sm text-destructive">{createError}</p>}
        </div>
      ) : (categories.length > 8 || createKind) && (
        <div className="flex gap-2">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">חיפוש קטגוריה</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              className="h-10 w-full rounded-xl border bg-background ps-9 pe-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="חיפוש קטגוריה"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          {createKind && (
            <button
              onClick={() => { setCreating(true); setNewName(query.trim()) }}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-dashed px-3.5 text-sm text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" aria-hidden />
              חדשה
            </button>
          )}
        </div>
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
          {contains && <ContainsField pattern={pattern} onChange={setPattern} kind={contains.kind} />}
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

/** How many rows a text reaches, from /api/category-keyword-rules/preview; null while counting */
function useKeywordCount(pattern: string, kind: 'EXPENSE' | 'INCOME') {
  const [count, setCount] = useState<{ matches: number; applies: number } | null>(null)
  useEffect(() => {
    if (!validKeyword(pattern)) { setCount(null); return }
    const abort = new AbortController()
    // Counted once typing pauses
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/category-keyword-rules/preview?${new URLSearchParams({ pattern: normalizeKeyword(pattern), kind })}`,
          { signal: abort.signal }
        )
        if (res.ok) setCount(await res.json())
      } catch {
        // Aborted by the next keystroke
      }
    }, 250)
    return () => { clearTimeout(timer); abort.abort() }
  }, [pattern, kind])
  return validKeyword(pattern) ? count : null
}

/** The live count beside a contains-text field: "12 תנועות", and how many keep a category of their own */
export function KeywordCount({ pattern, kind, className }: { pattern: string; kind: 'EXPENSE' | 'INCOME'; className?: string }) {
  const count = useKeywordCount(pattern, kind)
  const text = !validKeyword(pattern)
    ? `לפחות ${MIN_KEYWORD_LENGTH} תווים`
    : !count
      ? 'סופר…'
      : count.matches === 0
        ? 'אין עדיין תנועות כאלה'
        : `${count.matches === 1 ? 'תנועה אחת' : `${count.matches} תנועות`}${
            count.matches > count.applies ? ` · ${count.matches - count.applies} עם קטגוריה משלהן לא ישתנו` : ''
          }`
  return (
    <span aria-live="polite" className={cn('text-xs tabular-nums text-muted-foreground', className)}>
      {text}
    </span>
  )
}

/** The text of a contains-text scope, under the scopes, with its live count */
function ContainsField({ pattern, onChange, kind }: { pattern: string; onChange: (v: string) => void; kind: 'EXPENSE' | 'INCOME' }) {
  return (
    <div className="contains-field space-y-1.5 rounded-xl bg-emerald-500/5 p-3 ring-1 ring-inset ring-emerald-500/30">
      <label className="relative block">
        <span className="sr-only">הטקסט שהתנועות מכילות</span>
        <TextSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <input
          dir="auto"
          autoFocus
          className="h-10 w-full rounded-xl border bg-background ps-9 pe-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
          value={pattern}
          onChange={e => onChange(e.target.value)}
        />
      </label>
      <KeywordCount pattern={pattern} kind={kind} className="block px-1" />
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
