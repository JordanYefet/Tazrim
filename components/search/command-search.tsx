'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Loader2, Search } from 'lucide-react'
import { splitTerms, transactionHref, type SearchPage } from '@/lib/search/query'
import { SearchResultList } from './search-result-list'
import { SearchEmptyState, SearchNoResults } from './search-states'

/** Dispatch on window to open the dialog from anywhere (the header button does). */
export const OPEN_SEARCH_EVENT = 'tazrim:open-search'
const LIMIT = 8
const DEBOUNCE_MS = 200

/**
 * ⌘K / Ctrl+K command-style search with live results from /api/search.
 * Arrow keys move, Enter opens the row, "all results" goes to /search.
 */
export function CommandSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<SearchPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
    }
  }, [])

  // Debounced fetch; a newer query aborts the older request
  useEffect(() => {
    const q = query.trim()
    if (!open || !splitTerms(q).length) {
      setPage(null)
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?${new URLSearchParams({ q, limit: String(LIMIT) })}`, { signal: ctrl.signal })
        const data = (await res.json()) as SearchPage
        setPage(data)
        setActive(0)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setPage({ results: [], nextCursor: null, total: 0 })
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, open])

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    document.getElementById(`cmd-result-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const results = page?.results ?? []
  const terms = splitTerms(query)
  const allHref = `/search?${new URLSearchParams({ q: query.trim() })}`

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      const r = results[active]
      if (r) router.push(transactionHref(r))
      else if (terms.length) router.push(allHref)
      else return
      close()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          dir="rtl"
          aria-describedby={undefined}
          className="fixed inset-x-3 top-[12vh] z-50 mx-auto flex max-h-[70vh] max-w-xl flex-col md:max-w-[720px] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl focus:outline-none"
        >
          <Dialog.Title className="sr-only">חיפוש תנועות</Dialog.Title>
          <div className="flex items-center gap-2 border-b px-3">
            {loading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="בית עסק, הערה או סכום…"
              aria-label="חיפוש תנועות"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="cmd-results"
              aria-activedescendant={results.length ? `cmd-result-${active}` : undefined}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">Esc</kbd>
          </div>

          <div ref={listRef} id="cmd-results" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {!terms.length ? (
              <SearchEmptyState compact />
            ) : page && !results.length && !loading ? (
              <SearchNoResults compact ignoredHidden />
            ) : (
              <SearchResultList
                results={results}
                terms={terms}
                activeIndex={active}
                onHover={setActive}
                onNavigate={close}
                compact
                idPrefix="cmd-result"
              />
            )}
          </div>

          {terms.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{page ? `${page.total} תוצאות` : ' '}</span>
              <Link
                href={allHref}
                onClick={close}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-primary hover:bg-primary/10"
              >
                כל התוצאות והסינונים
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
