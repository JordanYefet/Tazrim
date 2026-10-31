'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { hasCriteria, splitTerms, toSearchParams, type SearchFilters, type SearchPage, type SearchResult, type TextMode } from '@/lib/search/query'
import { formatCurrency } from '@/lib/utils/currency'
import { isCardPaymentRow } from '@/lib/insights/bank-categories'
import { CategoryPicker, CategoryPill, CONTAINS_SCOPE, containsScope } from '@/components/categories/category-picker'
import { suggestKeyword } from '@/lib/insights/keyword-rules'
import { BulkCategoryBar } from '@/components/categories/bulk-category-bar'
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
  textMode: TextMode
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
  textMode: f.textMode ?? 'all',
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
    textMode: s.textMode,
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

        {/* Several words: all of them (the default) or any one; quotes keep a phrase whole */}
        {splitTerms(form.text).length > 1 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <div role="radiogroup" aria-label="התאמת המילים" className="inline-flex rounded-lg border bg-card p-0.5">
              {([['all', 'כל המילים'], ['any', 'אחת מהמילים']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={form.textMode === mode}
                  onClick={() => update({ textMode: mode })}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    form.textMode === mode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span>
              ביטוי מדויק: <bdi>"בין מירכאות"</bdi>
            </span>
          </div>
        )}

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
  // A card row's category may be the issuer's own (unmapped): that is no category of yours
  const yours = new Set([...picker.expense, ...picker.income])
  const known = (category?: string) => (category && yours.has(category) ? category : null)

  /**
   * After a save: this row (and with a wider scope, the matching loaded rows) get the
   * category. `changed`: the rows a contains-text rule changed, as `source:id` keys.
   */
  function applied(target: SearchResult, category: string | null, wide: boolean, changed?: Set<string>) {
    const hit = (r: SearchResult) =>
      changed
        ? changed.has(keyOf(r))
        : r.id === target.id ||
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

  // Selecting rows for one category at once: rows ticked one by one, or every
  // match of the search (counted by the server, minus the rows unticked since)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Map<string, SearchResult>>(new Map())
  const [all, setAll] = useState<AllMatches | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [allLoading, setAllLoading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const isSelected = (r: SearchResult) => (all ? !excluded.has(keyOf(r)) : picked.has(keyOf(r)))
  const selectedCount = all ? all.bankOut + all.bankIn + all.card - excluded.size : picked.size

  function clearSelection() {
    setPicked(new Map())
    setAll(null)
    setExcluded(new Set())
    setBulkError(null)
  }

  function toggleRow(r: SearchResult) {
    const key = keyOf(r)
    if (all) {
      setExcluded(prev => {
        const next = new Set(prev)
        if (!next.delete(key)) next.add(key)
        return next
      })
    } else {
      setPicked(prev => {
        const next = new Map(prev)
        if (!next.delete(key)) next.set(key, r)
        return next
      })
    }
  }

  async function toggleAll() {
    if (all) return clearSelection()
    setAllLoading(true)
    setBulkError(null)
    try {
      const res = await fetch(`/api/search/bulk-category?${queryString}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? 'הבחירה נכשלה')
      setPicked(new Map())
      setExcluded(new Set())
      setAll(body as AllMatches)
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : 'הבחירה נכשלה')
    } finally {
      setAllLoading(false)
    }
  }

  // What the ticked rows are decides the categories offered; card charges take expense ones
  const chosen = [...picked.values()]
  const mix = all
    ? { out: all.bankOut > 0, in: all.bankIn > 0, bank: all.bankOut + all.bankIn > 0, card: all.card > 0 }
    : {
        out: chosen.some(r => r.source === 'bank' && r.amount > 0),
        in: chosen.some(r => r.source === 'bank' && r.amount <= 0),
        bank: chosen.some(r => r.source === 'bank'),
        card: chosen.some(r => r.source === 'card'),
      }
  const bulkKind = mix.in && (mix.out || mix.card) ? 'mixed' : mix.in ? 'income' : 'expense'

  async function saveBulk(category: string | null) {
    const res = await fetch('/api/search/bulk-category', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        all
          ? { category, query: queryString, exclude: [...excluded].map(fromKey) }
          : { category, items: [...picked.keys()].map(fromKey) }
      ),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setBulkError(body?.error ?? 'שמירת הקטגוריה נכשלה')
      return
    }
    const changed = new Set([
      ...(body.bankIds as string[]).map(id => `bank:${id}`),
      ...(body.cardIds as string[]).map(id => `card:${id}`),
    ])
    // Rows that got a category leave a "ללא קטגוריה" list, loaded or not
    if (uncategorizedOnly && category !== null) {
      setResults(prev => prev.filter(r => !changed.has(keyOf(r))))
      setRemoved(n => n + changed.size)
    } else {
      setResults(prev => prev.map(r => (changed.has(keyOf(r)) ? { ...r, category: category ?? undefined } : r)))
    }
    clearSelection()
    setSelecting(false)
  }

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
      <div className="flex min-h-9 items-center gap-2 px-2 pb-2">
        {selecting && (
          <label className="-my-2 -ms-2 inline-flex cursor-pointer items-center gap-2 p-2 text-xs">
            <input
              type="checkbox"
              aria-label="בחירת כל התוצאות"
              checked={!!all}
              ref={el => { if (el) el.indeterminate = !!all && excluded.size > 0 }}
              disabled={allLoading}
              onChange={toggleAll}
              className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))]"
            />
            {allLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
          </label>
        )}
        <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {selecting
            ? `בחירת כל ${initial.total - removed} התוצאות`
            : <>
                {initial.total - removed === 1 ? 'תוצאה אחת' : `${initial.total - removed} תוצאות`}
                {initial.total - removed > results.length ? ` · מוצגות ${results.length}` : ''}
              </>}
        </p>
        <button
          type="button"
          onClick={() => {
            if (selecting) clearSelection()
            setSelecting(s => !s)
          }}
          aria-pressed={selecting}
          className={cn(
            'ms-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selecting ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          {selecting ? 'סיום בחירה' : 'בחירה'}
        </button>
      </div>
      {bulkError && <p role="alert" className="px-2 pb-2 text-sm text-destructive">{bulkError}</p>}
      {selectedCount > 0 && (
        <div className="px-1 pb-2">
          <BulkCategoryBar
            count={selectedCount}
            kind={bulkKind}
            context={bulkContext(mix, bulkKind === 'income')}
            amount={all ? undefined : formatCurrency(chosen.reduce((sum, r) => sum + Math.abs(r.amount), 0))}
            categories={(bulkKind === 'income' ? picker.income : picker.expense).map(name => ({ name, color: picker.colors[name] }))}
            allowNone={!mix.card}
            onApply={saveBulk}
            onClear={clearSelection}
          />
        </div>
      )}
      <SearchResultList
        results={results}
        terms={terms}
        categoryInActions
        leading={
          selecting
            ? r => (
                <label className="-m-1 inline-flex h-10 w-8 items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={`בחירת ${r.description}`}
                    checked={selectable(r) && isSelected(r)}
                    disabled={!selectable(r)}
                    onChange={() => toggleRow(r)}
                    className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))] disabled:cursor-default disabled:opacity-30"
                  />
                </label>
              )
            : undefined
        }
        // The category pill (opens the category window, as in the tables) and mark as recurring
        // (ENG-71, expenses only); fixed slots keep the amounts aligned
        actions={r => (
          <span className="flex items-center gap-1">
            {!r.ignored && !isCardPayment(r) && (
              <CategoryPill
                name={known(r.category)}
                color={known(r.category) ? picker.colors[r.category!] : undefined}
                sourceName={known(r.category) ? undefined : r.category}
                onClick={() => setPicking(r)}
                className="max-w-28 sm:max-w-36"
              />
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

/** What "select every match" takes, counted by /api/search/bulk-category */
interface AllMatches {
  bankOut: number
  bankIn: number
  card: number
}

const keyOf = (r: Pick<SearchResult, 'source' | 'id'>) => `${r.source}:${r.id}`
const fromKey = (key: string) => {
  const i = key.indexOf(':')
  return { source: key.slice(0, i), id: key.slice(i + 1) }
}

/** A row can be ticked when its category pill shows: not hidden, not the bank's card payment */
const selectable = (r: SearchResult) => !r.ignored && !isCardPayment(r)

/** The bulk window's heading: which kinds of rows are in the selection */
function bulkContext(mix: { bank: boolean; card: boolean }, income: boolean) {
  if (mix.bank && mix.card) return 'תנועות בבנק וחיובים בכרטיס'
  if (mix.card) return 'חיובים בכרטיס'
  return income ? 'תנועות נכנסות בבנק' : 'תנועות יוצאות בבנק'
}

/** A bank row's payment to a card company never takes a category */
const isCardPayment = (r: SearchResult) =>
  r.source === 'bank' && r.amount > 0 && isCardPaymentRow({ description: r.description, originalDescription: r.originalDescription ?? r.description, debit: r.amount })

/** A search result's category window: the same one the bank and card tables open */
function ResultCategoryWindow({ result, picker, onClose, onApplied }: {
  result: SearchResult | null
  picker: PickerData
  onClose: () => void
  onApplied: (result: SearchResult, category: string | null, wide: boolean, changed?: Set<string>) => void
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

  async function save(category: string | null, scope: string | null, pattern?: string) {
    if (!r) return
    if (scope === CONTAINS_SCOPE) {
      const res = await fetch('/api/category-keyword-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, category, fromRow: { source: r.source, id: r.id } }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? 'שמירת הקטגוריה נכשלה')
        return
      }
      setError(null)
      onClose()
      const { cardIds, bankIds } = (await res.json()) as { cardIds: string[]; bankIds: string[] }
      onApplied(r, category, true, new Set([...cardIds.map(id => `card:${id}`), ...bankIds.map(id => `bank:${id}`)]))
      return
    }
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
        createKind={income ? 'INCOME' : 'EXPENSE'}
        current={r.category && (picker.expense.includes(r.category) || picker.income.includes(r.category)) ? r.category : null}
        allowNone={bank}
        scopes={
          generic
            ? undefined
            : bank
              ? [
                  { id: 'row', title: 'רק התנועה הזאת', sub: 'שאר התנועות עם התיאור הזה לא משתנות' },
                  { id: 'rule', title: `כל התנועות ${income ? 'הנכנסות' : 'היוצאות'} "${original}"`, sub: 'כולל תנועות שיועלו בהמשך; תנועה שבחרת לה ידנית לא משתנה' },
                  containsScope(original, income ? 'INCOME' : 'EXPENSE', suggestKeyword(original)),
                ]
              : [
                  { id: 'row', title: 'רק החיוב הזה', sub: `שאר החיובים מ${r.description} לא משתנים` },
                  { id: 'merchant', title: `כל החיובים מ${r.description}`, sub: 'בכל הכרטיסים של החברה, וגם בקבצים הבאים' },
                  containsScope(original, 'EXPENSE', suggestKeyword(original)),
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
