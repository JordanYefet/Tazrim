/**
 * What the log window and the /logs page show of the entries, as pure functions:
 * the filters, and the grouping by page request. A page request (an entry with data.page,
 * logged by lib/log/pages.ts) starts a group and is its first line; the lines after it
 * (the API calls the page makes) belong to it.
 */
import type { LogEntry, LogLevel, LogSource } from './buffer'

export type Tab = 'all' | 'app' | 'sync' | 'problems'
/** Settings → Debug "detail level": what goes into the window at all */
export type Detail = 'errors' | 'info' | 'debug'

/** A page request (a document load or a navigation): the line that starts a group. data.page is its title, "GET /bank?year=2026&month=3" */
export const isPageRequest = (e: LogEntry) => typeof e.data?.page === 'string'

const DETAIL_LEVELS: Record<Detail, LogLevel[]> = {
  errors: ['warn', 'error'],
  info: ['info', 'warn', 'error'],
  debug: ['debug', 'info', 'warn', 'error'],
}

export interface Filter {
  detail?: Detail
  tab?: Tab
  /** /logs: by level (problems = warn and error, errors = error only) and by source */
  level?: 'all' | 'problems' | 'errors'
  source?: 'all' | LogSource
  q?: string
}

export function filterEntries(entries: LogEntry[], f: Filter): LogEntry[] {
  const levels = DETAIL_LEVELS[f.detail ?? 'info']
  const q = (f.q ?? '').trim().toLowerCase()
  return entries.filter(e => {
    if (!levels.includes(e.level)) return false
    if (f.tab === 'app' && e.source !== 'app') return false
    if (f.tab === 'sync' && e.source !== 'sync') return false
    if (f.tab === 'problems' && e.level !== 'warn' && e.level !== 'error') return false
    if (f.level === 'problems' && e.level !== 'warn' && e.level !== 'error') return false
    if (f.level === 'errors' && e.level !== 'error') return false
    if (f.source && f.source !== 'all' && e.source !== f.source) return false
    if (q && !`${e.msg} ${e.source} ${e.level}`.toLowerCase().includes(q)) return false
    return true
  })
}

export const countProblems = (entries: LogEntry[]) => ({
  errors: entries.filter(e => e.level === 'error').length,
  warnings: entries.filter(e => e.level === 'warn').length,
})

export interface Group {
  /** The page request's id, or 0 for the lines before the first one */
  id: number
  /** The page request ("GET /bank?year=2026&month=3"); null for the lines before the first one */
  title: string | null
  ts: number
  lines: LogEntry[]
  worst: 'ok' | 'warn' | 'error'
}

const worstOf = (lines: LogEntry[]): Group['worst'] =>
  lines.some(l => l.level === 'error') ? 'error' : lines.some(l => l.level === 'warn') ? 'warn' : 'ok'

/** Entries (oldest first) split at each page request, which is the first line of its group */
export function groupByAction(entries: LogEntry[]): Group[] {
  const groups: Group[] = []
  let cur: Group | null = null
  for (const e of entries) {
    if (isPageRequest(e)) {
      cur = { id: e.id, title: String(e.data?.page), ts: e.ts, lines: [], worst: 'ok' }
      groups.push(cur)
    } else if (!cur) {
      cur = { id: 0, title: null, ts: e.ts, lines: [], worst: 'ok' }
      groups.push(cur)
    }
    cur.lines.push(e)
  }
  for (const g of groups) g.worst = worstOf(g.lines)
  return groups
}

/** The groups with the filters applied to their lines; a group with no line left is dropped (its title stays while any line shows) */
export function groupedView(entries: LogEntry[], f: Filter): Group[] {
  return groupByAction(entries)
    .map(g => {
      const lines = filterEntries(g.lines, f)
      return { ...g, lines, worst: worstOf(lines) }
    })
    .filter(g => g.lines.length > 0)
}

/** The last 3 sync runs, from the buffer: a run is the lines carrying the same data.run */
export interface RunSummary {
  run: number
  ts: number
  lastId: number
  failed: boolean
  /** "leumi" or "leumi, max": the companies it touched */
  companies: string[]
  added: number
  hasLines: boolean
}

export function recentRuns(entries: LogEntry[], n = 3): RunSummary[] {
  const byRun = new Map<number, RunSummary>()
  for (const e of entries) {
    const run = e.source === 'sync' ? e.data?.run : undefined
    if (typeof run !== 'number') continue
    let r = byRun.get(run)
    if (!r) byRun.set(run, (r = { run, ts: e.ts, lastId: e.id, failed: false, companies: [], added: 0, hasLines: true }))
    r.lastId = e.id
    if (e.level === 'error') r.failed = true
    const company = typeof e.data?.company === 'string' ? e.data.company : /^([a-z]+) · /.exec(e.msg)?.[1]
    if (company && !r.companies.includes(company)) r.companies.push(company)
    if (typeof e.data?.added === 'number') r.added += e.data.added
  }
  return [...byRun.values()].sort((a, b) => b.run - a.run).slice(0, n)
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** 21:42:07.112 in the browser's clock */
export function formatTime(ts: number, ms = true): string {
  const d = new Date(ts)
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return ms ? `${t}.${pad(d.getMilliseconds(), 3)}` : t
}

/** One line as plain text, for Copy */
export function lineText(e: LogEntry): string {
  return `${formatTime(e.ts)} ${e.level.toUpperCase().padEnd(5)} ${e.source.padEnd(4)} ${e.msg}`
}

/** The page request a line happened under: the latest one before it (itself, for a page request) */
export function pageOf(entries: LogEntry[], id: number): string | null {
  let title: string | null = null
  for (const e of entries) {
    if (isPageRequest(e)) title = String(e.data?.page)
    if (e.id === id) return title
  }
  return null
}

/** What the details pane shows of a line: its fields as JSON */
export function detailsJson(e: LogEntry): string {
  return JSON.stringify(e.data ?? {}, null, 2)
}

/** What Copy writes: the visible lines (flat), or the groups' lines, a blank line between groups */
export function copyText(visible: LogEntry[], groups: Group[] | null): string {
  if (!groups) return visible.map(lineText).join('\n')
  return groups.map(g => g.lines.map(lineText).join('\n')).join('\n\n')
}
