'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, Minimize2, Pause, Play } from 'lucide-react'
import { countProblems, filterEntries, groupedView, isAction, lineText, type Tab } from '@/lib/log/view'
import { cn } from '@/lib/utils/cn'
import { ConsoleList } from './console'
import { useLogPrefs } from './prefs'
import { useLogStream } from './use-log-stream'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'app', label: 'App' },
  { id: 'sync', label: 'Sync' },
  { id: 'problems', label: 'Problems' },
]

/**
 * /logs/full (ENG-104): the log on the whole screen, with no app shell around it (the route is
 * a bare page, lib/auth/config.ts isBarePath). A thin top bar; a click on a line opens its JSON
 * under it; Esc or the button goes back to /logs.
 */
export function LogsFullscreen() {
  const router = useRouter()
  const prefs = useLogPrefs()
  const [paused, setPaused] = useState(false)
  const { entries, status } = useLogStream({ paused })
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push('/logs')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  const filter = { detail: 'debug' as const, tab, q }
  const visible = useMemo(() => filterEntries(entries, filter), [entries, tab, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => (prefs.grouped ? groupedView(entries, filter) : null), [entries, tab, q, prefs.grouped]) // eslint-disable-line react-hooks/exhaustive-deps
  const problems = countProblems(entries)
  const problemCount = problems.errors + problems.warnings
  const live = status === 'live' && !paused

  const copy = async () => {
    const text = (groups ? groups.flatMap(g => g.lines) : visible).filter(e => !isAction(e)).map(lineText).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: nothing to do
    }
  }

  const IB = 'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[7px] px-1.5 text-xs text-[hsl(var(--lc-dim))] hover:bg-[hsl(220_20%_20%)] hover:text-[hsl(var(--lc-fg))]'

  return (
    <div dir="ltr" className="log-console fixed inset-0 z-50 flex flex-col bg-[hsl(220_24%_11%)]">
      <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 border-b border-[hsl(var(--lc-rule))] ps-5 pe-3">
        <span aria-hidden className="text-[0.8rem] text-[hsl(var(--lc-accent))]">&gt;_</span>
        <h1 className="text-[0.8rem] font-normal">tazrim · logs</h1>
        <span role="status" className={cn('inline-flex items-center gap-1.5 text-[11px]', live ? 'text-[hsl(var(--lc-ok))]' : 'text-[hsl(var(--lc-dim))]')}>
          <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-[hsl(var(--lc-ok))]' : 'bg-[hsl(var(--lc-dim))]')} />
          {live ? 'live' : paused ? 'paused' : status === 'denied' ? 'no access' : status === 'offline' ? 'offline' : '…'}
        </span>
        <div role="group" aria-label="Filter" className="ms-2 flex">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn('h-11 px-2.5 text-xs', tab === t.id ? 'text-[hsl(var(--lc-fg))] shadow-[inset_0_-2px_0_hsl(var(--lc-accent))]' : 'text-[hsl(var(--lc-dim))]')}
            >
              {t.label}
              {t.id === 'problems' && problemCount > 0 ? ` · ${problemCount}` : ''}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <label htmlFor="fsq" className="sr-only">Search logs</label>
        <input
          id="fsq"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="search…"
          className="h-8 w-full max-w-[220px] rounded-[7px] border border-[hsl(220_18%_26%)] bg-[hsl(var(--lc-deep))] px-2.5 text-xs text-[hsl(var(--lc-fg))] placeholder:text-[hsl(var(--lc-dim))]"
        />
        <button type="button" aria-pressed={paused} onClick={() => setPaused(p => !p)} aria-label="Pause" title="Pause" className={IB}>
          {paused ? <Play aria-hidden className="h-3.5 w-3.5" /> : <Pause aria-hidden className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={copy} aria-label="Copy" title="Copy" className={IB}>
          {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          <span className="sr-only" role="status">{copied ? 'Copied' : ''}</span>
        </button>
        <span aria-hidden className="h-[18px] w-px bg-[hsl(var(--lc-border))]" />
        <Link href="/logs" aria-label="Exit full screen" title="Exit full screen" className={IB}>
          <Minimize2 aria-hidden className="h-3.5 w-3.5" />
          <span>Esc</span>
        </Link>
      </header>
      <ConsoleList
        lines={visible}
        groups={groups}
        selectedId={selectedId}
        onSelect={setSelectedId}
        size="md"
        inline="always"
        emptyText="אין שורות שמתאימות לחיפוש ולסינון."
        className="pt-2"
      />
    </div>
  )
}
