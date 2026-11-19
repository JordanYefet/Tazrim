/**
 * What the log window and the /logs page show of the entries, as pure functions:
 * the filters, and the grouping by page. A page request (an entry with data.page, logged by
 * lib/log/pages.ts) sets the page the lines after it (the API calls it makes) belong to; all the
 * visits to one path, whatever their query, share a group titled by the path.
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
  /** The first page request of this path still in the buffer, or 0 for the lines before any page request */
  id: number
  /** The page's path, without the method or the query ("/banks/acct_leumi"); null for the lines before any page request */
  title: string | null
  /** The group's latest line: the groups are ordered by it, so the page in use is the last one */
  ts: number
  lines: LogEntry[]
  worst: 'ok' | 'warn' | 'error'
}

const worstOf = (lines: LogEntry[]): Group['worst'] =>
  lines.some(l => l.level === 'error') ? 'error' : lines.some(l => l.level === 'warn') ? 'warn' : 'ok'

/** "GET /banks/acct_leumi?year=2026&month=3" → "/banks/acct_leumi" */
export function pagePath(page: string): string {
  return page.replace(/^[A-Z]+\s+/, '').split('?')[0] || '/'
}

/**
 * Entries (oldest first) grouped by page: every line goes to the page of the latest page request
 * before it, and every visit to the same path (any month, any filter in the query) lands in one
 * group. Lines stay oldest first inside a group; the groups are ordered by their latest line.
 */
export function groupByAction(entries: LogEntry[]): Group[] {
  const byPath = new Map<string | null, Group>()
  let cur: Group | null = null
  for (const e of entries) {
    if (isPageRequest(e) || !cur) {
      const title = isPageRequest(e) ? pagePath(String(e.data?.page)) : null
      cur = byPath.get(title) ?? null
      if (!cur) {
        cur = { id: title === null ? 0 : e.id, title, ts: e.ts, lines: [], worst: 'ok' }
        byPath.set(title, cur)
      }
    }
    cur.lines.push(e)
    cur.ts = e.ts
  }
  const groups = [...byPath.values()].sort((a, b) => a.ts - b.ts)
  for (const g of groups) g.worst = worstOf(g.lines)
  return groups
}

/** The groups with the filters applied to their lines; a group with no line left is dropped (its title stays while any line shows) */
export function groupedView(entries: LogEntry[], f: Filter): Group[] {
  return groupByAction(entries)
    .map(g => {
      const lines = filterEntries(g.lines, f)
      return { ...g, lines, ts: lines.at(-1)?.ts ?? g.ts, worst: worstOf(lines) }
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
