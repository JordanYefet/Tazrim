'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Ban, Check, Copy, ListTree, Maximize2, Pause, Play, Search } from 'lucide-react'
import { syncCompany } from '@/lib/sync/providers'
import { pageOf, countProblems, filterEntries, formatTime, groupedView, copyText, recentRuns, type Filter, type RunSummary } from '@/lib/log/view'
import { cn } from '@/lib/utils/cn'
import { ConsoleList, DetailsPane } from './console'
import { setLogPrefs, useLogPrefs } from './prefs'
import { useLogStream } from './use-log-stream'

const LEVELS: { id: NonNullable<Filter['level']>; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'problems', label: 'בעיות' },
  { id: 'errors', label: 'שגיאות' },
]
const SOURCES: { id: NonNullable<Filter['source']>; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'app', label: 'אפליקציה' },
  { id: 'sync', label: 'סנכרון' },
]

const SEG = 'rounded-lg px-3 py-1.5 text-[0.8125rem] transition-colors duration-quick motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const BTN =
  'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-[10px] border bg-card px-3 text-[0.8125rem] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:min-w-9'

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-[10px] bg-muted p-[3px]">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(SEG, value === o.id ? 'bg-card font-semibold text-foreground shadow-e1' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

/** "לפני 2 שעות" for the server's start */
function ago(since: number): string {
  const min = Math.round((Date.now() - since) / 60_000)
  const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' })
  if (min < 1) return 'ממש עכשיו'
  if (min < 60) return rtf.format(-min, 'minute')
  if (min < 60 * 24) return rtf.format(-Math.round(min / 60), 'hour')
  return rtf.format(-Math.round(min / 1440), 'day')
}

/** "היום 21:42", "אתמול 08:00" or the date */
function when(ts: number): string {
  const d = new Date(ts)
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86_400_000)
  const t = formatTime(ts, false).slice(0, 5)
  if (days === 0) return `היום ${t}`
  if (days === 1) return `אתמול ${t}`
  return `${d.getDate()}.${d.getMonth() + 1} ${t}`
}

const companyNames = (r: RunSummary) => r.companies.map(c => syncCompany(c)?.label ?? c).join(', ')

/**
 * /logs (ENG-104): the same log as the window, with room: a summary, the last sync runs,
 * search and filters, the list and a details pane. Not in the nav; Settings → Debug links here.
 */
export function LogsPage() {
  const prefs = useLogPrefs()
  const [paused, setPaused] = useState(false)
  const { entries, stats, status, clear } = useLogStream({ paused })
  const [level, setLevel] = useState<NonNullable<Filter['level']>>('all')
  const [source, setSource] = useState<NonNullable<Filter['source']>>('all')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [revealId, setRevealId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  // The page shows every level: the detail level in Settings is for the window
  const filter: Filter = { detail: 'debug', level, source, q }
  const visible = useMemo(() => filterEntries(entries, filter), [entries, level, source, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => (prefs.grouped ? groupedView(entries, filter) : null), [entries, level, source, q, prefs.grouped]) // eslint-disable-line react-hooks/exhaustive-deps
  const problems = useMemo(() => countProblems(entries), [entries])
  const runs = useMemo(() => recentRuns(entries), [entries])
  const selected = selectedId == null ? null : entries.find(e => e.id === selectedId) ?? null
  const live = status === 'live' && !paused

  const copy = async () => {
    const text = copyText(visible, groups)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: nothing to do
    }
  }

  return (
    <div className="page-in mx-auto flex min-w-0 max-w-7xl flex-col gap-4 md:h-[calc(100dvh-8.5rem)] md:min-h-[480px]">
      <Link
        href="/settings/debug"
        className="-ms-2 inline-flex min-h-11 w-fit items-center rounded-lg pe-3 ps-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        → דיבאג
      </Link>

      <div className="flex min-h-9 flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">לוגים</h1>
        <span dir="ltr" className="font-mono text-xs text-muted-foreground">/logs</span>
        <span className={cn('inline-flex items-center gap-1.5 text-[0.8125rem]', live ? 'text-income' : 'text-muted-foreground')} role="status">
          <span aria-hidden className={cn('h-[7px] w-[7px] rounded-full', live ? 'bg-income' : 'bg-muted-foreground')} />
          {live ? 'חי' : paused ? 'מושהה' : status === 'offline' ? 'אין חיבור לשרת' : status === 'denied' ? 'אין הרשאה' : 'טוען'}
        </span>
        <span className="flex-1" />
        <span className="text-[0.8125rem] text-muted-foreground">
          {stats ? `${stats.total} שורות מאז ${ago(stats.since)}` : ' '}
          {stats && (
            <>
              {' · '}
              <span className="text-destructive dark:text-red-400">{plural(problems.errors, 'שגיאה', 'שגיאות')}</span>
              {' · '}
              <span className="text-cc">{plural(problems.warnings, 'אזהרה', 'אזהרות')}</span>
            </>
          )}
        </span>
      </div>

      <section aria-label="ריצות סנכרון אחרונות" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[0, 1, 2].map(i => {
          const r = runs[i]
          if (!r) {
            return (
              <div key={`empty-${i}`} className="flex min-h-[4.25rem] flex-col gap-1.5 rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground opacity-60">
                <span className="font-semibold">אין ריצה</span>
                <span className="text-[0.8125rem]">ריצות סנכרון יופיעו כאן.</span>
              </div>
            )
          }
          return (
            <button
              key={r.run}
              type="button"
              onClick={() => {
                setSource('sync')
                setLevel('all')
                setQ('')
                setSelectedId(r.lastId)
                setRevealId(r.lastId)
              }}
              className="surface flex min-h-[4.25rem] flex-col gap-1.5 rounded-xl px-3.5 py-3 text-start hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden className={cn('h-2 w-2 rounded-full', r.failed ? 'bg-destructive' : 'bg-income')} />
                סנכרון #{r.run}
                <span className="flex-1" />
                <span className="text-xs font-normal text-muted-foreground">{when(r.ts)}</span>
              </span>
              <span className="text-[0.8125rem] text-muted-foreground">
                {r.failed ? 'היו כשלים' : `הצליח · ${plural(r.added, 'תנועה חדשה', 'תנועות חדשות')}`}
                {r.companies.length ? ` · ${companyNames(r)}` : ''}
              </span>
            </button>
          )
        })}
      </section>

      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="logq" className="sr-only">חיפוש בלוגים</label>
        <div className="relative w-full sm:w-[13.5rem]">
          <input
            id="logq"
            type="search"
            dir="ltr"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="search: max, /api, TIMEOUT…"
            className="h-11 w-full rounded-[10px] border border-input bg-card ps-9 pe-3 font-mono text-[0.78rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"
          />
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <Segmented label="רמה" value={level} options={LEVELS} onChange={setLevel} />
        <Segmented label="מקור" value={source} options={SOURCES} onChange={setSource} />
        <button
          type="button"
          aria-pressed={prefs.grouped}
          onClick={() => setLogPrefs({ grouped: !prefs.grouped })}
          className={cn(BTN, prefs.grouped && 'border-primary/50 bg-primary/10 font-semibold text-primary')}
        >
          <ListTree aria-hidden className="h-3.5 w-3.5" />
          קיבוץ לפי פעולה
        </button>
        <span className="flex-1" />
        <Link href="/logs/full" aria-label="מסך מלא" title="מסך מלא" className={BTN}>
          <Maximize2 aria-hidden className="h-3.5 w-3.5" />
        </Link>
        <button type="button" aria-pressed={paused} onClick={() => setPaused(p => !p)} aria-label={paused ? 'המשך' : 'השהיה'} title={paused ? 'המשך' : 'השהיה'} className={BTN}>
          {paused ? <Play aria-hidden className="h-3.5 w-3.5" /> : <Pause aria-hidden className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={copy} aria-label="העתקה" title="העתקה" className={BTN}>
          {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          <span className="sr-only" role="status">{copied ? 'הועתק' : ''}</span>
        </button>
        <button type="button" onClick={() => { void clear(); setSelectedId(null) }} aria-label="ניקוי" title="ניקוי" className={BTN}>
          <Ban aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>

      <section aria-label="לוגים" dir="ltr" className="log-console flex h-[60dvh] min-h-[320px] overflow-hidden rounded-[14px] border border-[hsl(var(--lc-border))] md:h-auto md:min-h-0 md:flex-1">
        <ConsoleList
          lines={visible}
          groups={groups}
          selectedId={selectedId}
          onSelect={setSelectedId}
          revealId={revealId}
          size="md"
          inline="phone"
          hasAny={entries.length > 0}
          emptyText="אין שורות שמתאימות לחיפוש ולסינון."
        />
        <DetailsPane entry={selected} page={selected ? pageOf(entries, selected.id) : null} className="w-[340px] max-md:hidden" />
      </section>
    </div>
  )
}
