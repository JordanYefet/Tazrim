'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { hasCriteria, splitTerms, toSearchParams, type SearchFilters, type SearchPage, type SearchResult } from '@/lib/search/query'
import { formatCurrency } from '@/lib/utils/currency'
import { isCardPaymentRow } from '@/lib/insights/bank-categories'
import { CategoryPicker, CategoryPill } from '@/components/categories/category-picker'
import { SearchResultList } from './search-result-list'
import { MarkRecurringButton } from '@/components/recurring/mark-recurring'
import { SearchEmptyState, SearchNoResults } from './search-states'

interface AccountOption {
  id: string
  name: string
  kind: string
}

interface Props {
  filters: SearchFilters
  /** The filters as a query string (no cursor), from the server */
  queryString: string
  page: SearchPage
  accounts: AccountOption[]
  categories: string[]
  /** What a result's category window needs */
  picker: PickerData
}

interface PickerData {
  /** Category names by kind: card charges and bank debits take expense ones, bank credits income ones */
  expense: string[]
  income: string[]
  /** Each category's chart colour */
  colors: Record<string, string>
  /** Bank descriptions categorised row by row, never by a rule */
  generic: string[]
}

interface FormState {
  text: string
  amountInput: string
  from: string
  to: string
  accountIds: string[]
  category: string
  includeIgnored: boolean
}

/** The category field's value for "no category" (the uncategorized=1 filter) */
const NONE = '__none'

const toForm = (f: SearchFilters): FormState => ({
  text: f.text ?? '',
  amountInput: f.amountInput ?? '',
  from: f.from ?? '',
  to: f.to ?? '',
  accountIds: f.accountIds ?? [],
  category: f.uncategorized ? NONE : (f.categories?.[0] ?? ''),
  includeIgnored: f.includeIgnored,
})

const formQuery = (s: FormState) =>
  toSearchParams({
    text: s.text.trim() || undefined,
    amountInput: s.amountInput.trim() || undefined,
    from: s.from || undefined,
    to: s.to || undefined,
    accountIds: s.accountIds,
    categories: s.category && s.category !== NONE ? [s.category] : [],
    uncategorized: s.category === NONE,
    includeIgnored: s.includeIgnored,
  }).toString()

const DEBOUNCE_MS = 300

const field =
  'h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:light] dark:[color-scheme:dark]'

/** /search: filters (kept in the URL) and the results, with "load more" through /api/search. */
export function SearchView({ filters, queryString, page, accounts, categories, picker }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => toForm(filters))
  const [pending, startTransition] = useTransition()
  const lastPushed = useRef(queryString)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const advancedActive = Boolean(
    filters.amountInput || filters.from || filters.to || filters.accountIds?.length || filters.categories?.length || filters.uncategorized || filters.includeIgnored
  )
  const [showFilters, setShowFilters] = useState(advancedActive)

  // The URL changed from outside (back button, the ⌘K "all results" link): follow it
  useEffect(() => {
    if (queryString !== lastPushed.current) {
      lastPushed.current = queryString
      setForm(toForm(filters))
    }
  }, [queryString, filters])

  useEffect(() => () => clearTimeout(timer.current), [])

  function push(next: FormState, delay: number) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const qs = formQuery(next)
      if (qs === lastPushed.current) return
      lastPushed.current = qs
      startTransition(() => router.replace(qs ? `/search?${qs}` : '/search', { scroll: false }))
    }, delay)
  }

  function update(patch: Partial<FormState>, delay = 0) {
    const next = { ...form, ...patch }
    setForm(next)
    push(next, delay)
  }

  const toggleAccount = (id: string) =>
    update({
      accountIds: form.accountIds.includes(id) ? form.accountIds.filter(a => a !== id) : [...form.accountIds, id],
    })

  const terms = splitTerms(filters.text)
  const criteria = hasCriteria(filters)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">חיפוש</h1>

      <div className="space-y-3 rounded-xl surface p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <label className="relative flex-1">
            <span className="sr-only">טקסט חופשי</span>
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={form.text}
              onChange={e => update({ text: e.target.value }, DEBOUNCE_MS)}
              placeholder="בית עסק, תיאור, הערה או סכום…"
              enterKeyHint="search"
              autoFocus
              className={cn(field, 'h-10 pr-9')}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowFilters(s => !s)}
            aria-expanded={showFilters}
            aria-controls="search-filters"
            className={cn(
              'relative flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              showFilters ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span>סינון</span>
            {advancedActive && <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-primary" aria-label="יש סינון פעיל" />}
          </button>
        </div>

        {showFilters && (
          <div id="search-filters" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 space-y-1 sm:col-span-1">
              <span className="text-xs text-muted-foreground">סכום</span>
              <input
                value={form.amountInput}
                onChange={e => update({ amountInput: e.target.value }, DEBOUNCE_MS)}
                placeholder="120 / 100-200"
                inputMode="decimal"
                dir="ltr"
                aria-invalid={filters.amountInvalid || undefined}
                aria-describedby={filters.amountInvalid ? 'amount-error' : undefined}
                className={cn(field, 'text-right', filters.amountInvalid && 'ring-2 ring-destructive')}
              />
              {filters.amountInvalid && (
                <span id="amount-error" className="block text-xs text-destructive">
                  סכום לא תקין
                </span>
              )}
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">מתאריך</span>
              <input type="date" value={form.from} max={form.to || undefined} onChange={e => update({ from: e.target.value })} className={field} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">עד תאריך</span>
              <input type="date" value={form.to} min={form.from || undefined} onChange={e => update({ to: e.target.value })} className={field} />
            </label>
            <label className="col-span-2 space-y-1 sm:col-span-1">
              <span className="text-xs text-muted-foreground">קטגוריה</span>
              <select value={form.category} onChange={e => update({ category: e.target.value })} className="h-9 w-full">
                <option value="">כל הקטגוריות</option>
                <option value={NONE}>ללא קטגוריה</option>
                {categories.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="col-span-2 sm:col-span-4">
              <legend className="mb-1 text-xs text-muted-foreground">חשבונות</legend>
              <div className="flex flex-wrap gap-1.5">
                {accounts.map(a => {
                  const on = form.accountIds.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAccount(a.id)}
                      className={cn(
                        'h-8 rounded-full border px-3 text-xs transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        on ? 'border-primary/40 bg-primary/10 text-primary font-medium' : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {a.name}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.includeIgnored}
                  onChange={e => update({ includeIgnored: e.target.checked })}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                כולל תנועות מוסתרות
              </label>
              {advancedActive && (
                <button
                  type="button"
                  onClick={() => update({ amountInput: '', from: '', to: '', accountIds: [], category: '', includeIgnored: false })}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  ניקוי סינונים
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={cn('transition-opacity', pending && 'opacity-60')} aria-busy={pending}>
        {!criteria ? (
          <SearchEmptyState />
        ) : page.results.length === 0 ? (
          filters.amountInvalid ? null : <SearchNoResults ignoredHidden={!filters.includeIgnored} />
        ) : (
          <Results key={queryString} initial={page} queryString={queryString} terms={terms} picker={picker} uncategorizedOnly={!!filters.uncategorized} />
        )}
      </div>
    </div>
  )
}

function Results({ initial, queryString, terms, picker, uncategorizedOnly }: {
  initial: SearchPage
  queryString: string
  terms: string[]
  picker: PickerData
  /** The list is "ללא קטגוריה": a result that gets a category leaves it */
  uncategorizedOnly: boolean
}) {
  const [results, setResults] = useState(initial.results)
  const [removed, setRemoved] = useState(0)
  const [picking, setPicking] = useState<SearchResult | null>(null)

  /** After a save: this row (and with a wider scope, the matching loaded rows) get the category */
  function applied(target: SearchResult, category: string | null, wide: boolean) {
    const hit = (r: SearchResult) =>
      r.id === target.id ||
      (wide && r.source === target.source && r.accountId === target.accountId && (r.originalDescription ?? r.description) === (target.originalDescription ?? target.description))
    if (uncategorizedOnly && category !== null) {
      const gone = results.filter(hit).length
      setResults(prev => prev.filter(r => !hit(r)))
      setRemoved(n => n + gone)
    } else {
      setResults(prev => prev.map(r => (hit(r) ? { ...r, category: category ?? undefined } : r)))
    }
  }
  const [cursor, setCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function loadMore() {
    if (!cursor) return
    setLoading(true)
    setError(false)
    try {
      const sp = new URLSearchParams(queryString)
      sp.set('cursor', cursor)
      const res = await fetch(`/api/search?${sp}`)
      if (!res.ok) throw new Error(String(res.status))
      const next = (await res.json()) as SearchPage
      setResults(r => [...r, ...next.results])
      setCursor(next.nextCursor)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-xl surface p-2 sm:p-3">
      <p className="px-2 pb-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {initial.total - removed === 1 ? 'תוצאה אחת' : `${initial.total - removed} תוצאות`}
        {initial.total - removed > results.length ? ` · מוצגות ${results.length}` : ''}
      </p>
      <SearchResultList
        results={results}
        terms={terms}
        categoryInActions
        // The category pill (opens the category window, as in the tables) and mark as recurring
        // (ENG-71, expenses only); fixed slots keep the amounts aligned
        actions={r => (
          <span className="flex items-center gap-1">
            {!r.ignored && !isCardPayment(r) && (
              <CategoryPill name={r.category ?? null} color={r.category ? picker.colors[r.category] : undefined} onClick={() => setPicking(r)} className="max-w-28 sm:max-w-36" />
            )}
            <span className="flex h-8 w-7 items-center justify-center">
              {r.amount > 0 && !r.ignored && <MarkRecurringButton source={r.source} transactionId={r.id} seriesName={r.recurringLabel} />}
            </span>
          </span>
        )}
      />
      <ResultCategoryWindow result={picking} picker={picker} onClose={() => setPicking(null)} onApplied={applied} />
      {cursor && (
        <div className="px-2 pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border bg-muted text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {error ? 'שגיאה בטעינה, לנסות שוב' : 'טעינת עוד'}
          </button>
        </div>
      )}
    </section>
  )
}

/** A bank row's payment to a card company never takes a category */
const isCardPayment = (r: SearchResult) =>
  r.source === 'bank' && r.amount > 0 && isCardPaymentRow({ description: r.description, originalDescription: r.originalDescription ?? r.description, debit: r.amount })

/** A search result's category window: the same one the bank and card tables open */
function ResultCategoryWindow({ result, picker, onClose, onApplied }: {
  result: SearchResult | null
  picker: PickerData
  onClose: () => void
  onApplied: (result: SearchResult, category: string | null, wide: boolean) => void
}) {
  // The last result stays while the window animates out
  const [last, setLast] = useState<SearchResult | null>(result)
  if (result && result !== last) setLast(result)
  const r = result ?? last
  const [error, setError] = useState<string | null>(null)
  if (!r) return null
  const bank = r.source === 'bank'
  const income = r.amount < 0
  const original = r.originalDescription ?? r.description
  const generic = bank && picker.generic.includes(original)
  const names = income ? picker.income : picker.expense

  async function save(category: string | null, scope: string | null) {
    if (!r) return
    const wide = scope === 'rule' || scope === 'merchant'
    const res = bank
      ? await fetch(`/api/bank/transactions/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, categoryScope: wide ? 'rule' : 'row' }),
        })
      : await fetch(`/api/cards/${encodeURIComponent(r.accountId)}/transactions/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryOverride: category, categoryScope: wide ? 'merchant' : 'row' }),
        })
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? 'שמירת הקטגוריה נכשלה')
      return
    }
    setError(null)
    onClose()
    onApplied(r, category, wide)
  }

  return (
    <>
      <CategoryPicker
        open={!!result}
        onOpenChange={o => !o && onClose()}
        context={`${bank ? (income ? 'תנועה נכנסת' : 'תנועה יוצאת') : 'חיוב'} · ${r.accountName} · ${displayDay(r.date)}`}
        title={r.description}
        amount={formatCurrency(Math.abs(r.amount))}
        amountTone={income ? 'income' : 'expense'}
        categories={names.map(name => ({ name, color: picker.colors[name] }))}
        current={r.category ?? null}
        allowNone={bank}
        scopes={
          generic
            ? undefined
            : bank
              ? [
                  { id: 'row', title: 'רק התנועה הזאת', sub: 'שאר התנועות עם התיאור הזה לא משתנות' },
                  { id: 'rule', title: `כל התנועות ${income ? 'הנכנסות' : 'היוצאות'} "${original}"`, sub: 'כולל תנועות שיועלו בהמשך; תנועה שבחרת לה ידנית לא משתנה' },
                ]
              : [
                  { id: 'row', title: 'רק החיוב הזה', sub: `שאר החיובים מ${r.description} לא משתנים` },
                  { id: 'merchant', title: `כל החיובים מ${r.description}`, sub: 'בכל הכרטיסים של החברה, וגם בקבצים הבאים' },
                ]
        }
        note={generic ? `"${original}" הוא תיאור כללי: הקטגוריה נשמרת לתנועה הזאת בלבד.` : undefined}
        onSave={save}
      />
      {error && <p role="alert" className="px-2 pt-2 text-sm text-destructive">{error}</p>}
    </>
  )
}

/** DD.MM.YYYY from the result's YYYY-MM-DD key */
const displayDay = (key: string) => key.split('-').reverse().join('.')
