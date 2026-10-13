'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { hasCriteria, splitTerms, toSearchParams, type SearchFilters, type SearchPage } from '@/lib/search/query'
import { SearchResultList } from './search-result-list'
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

const toForm = (f: SearchFilters): FormState => ({
  text: f.text ?? '',
  amountInput: f.amountInput ?? '',
  from: f.from ?? '',
  to: f.to ?? '',
  accountIds: f.accountIds ?? [],
  category: f.categories?.[0] ?? '',
  includeIgnored: f.includeIgnored,
})

const formQuery = (s: FormState) =>
  toSearchParams({
    text: s.text.trim() || undefined,
    amountInput: s.amountInput.trim() || undefined,
    from: s.from || undefined,
    to: s.to || undefined,
    accountIds: s.accountIds,
    categories: s.category ? [s.category] : [],
    includeIgnored: s.includeIgnored,
  }).toString()

const DEBOUNCE_MS = 300

const field =
  'h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:light] dark:[color-scheme:dark]'

/** /search: filters (kept in the URL) and the results, with "load more" through /api/search. */
export function SearchView({ filters, queryString, page, accounts, categories }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => toForm(filters))
  const [pending, startTransition] = useTransition()
  const lastPushed = useRef(queryString)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const advancedActive = Boolean(
    filters.amountInput || filters.from || filters.to || filters.accountIds?.length || filters.categories?.length || filters.includeIgnored
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

      <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
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
          <Results key={queryString} initial={page} queryString={queryString} terms={terms} />
        )}
      </div>
    </div>
  )
}

function Results({ initial, queryString, terms }: { initial: SearchPage; queryString: string; terms: string[] }) {
  const [results, setResults] = useState(initial.results)
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
    <section className="rounded-xl border bg-card p-2 sm:p-3">
      <p className="px-2 pb-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {initial.total === 1 ? 'תוצאה אחת' : `${initial.total} תוצאות`}
        {initial.total > results.length ? ` · מוצגות ${results.length}` : ''}
      </p>
      <SearchResultList results={results} terms={terms} />
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
