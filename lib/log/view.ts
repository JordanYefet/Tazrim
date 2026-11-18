/**
 * What the log window and the /logs page show of the entries, as pure functions:
 * the filters, and the grouping by action. A marker (an entry with data.action, posted
 * when the page changes) starts a group; the lines after it belong to it.
 */
import type { LogEntry, LogLevel, LogSource } from './buffer'

export type Tab = 'all' | 'app' | 'sync' | 'problems'
/** Settings → Debug "detail level": what goes into the window at all */
export type Detail = 'errors' | 'info' | 'debug'

export const isAction = (e: LogEntry) => e.data?.action === true

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
  /** The marker's id, or 0 for the lines before the first marker */
  id: number
  /** The action's name; null for the lines before the first marker */
  title: string | null
  ts: number
  lines: LogEntry[]
  worst: 'ok' | 'warn' | 'error'
}

/**
 * Entries (oldest first) split at each action marker. A marker with no lines after it
 * still makes a group (the page was opened and nothing was logged); `keepEmpty: false`
 * drops those, for when a filter is on and an empty group would only be noise.
 */
export function groupByAction(entries: LogEntry[], keepEmpty = true): Group[] {
  const groups: Group[] = []
  let cur: Group | null = null
  for (const e of entries) {
    if (isAction(e)) {
      cur = { id: e.id, title: e.msg, ts: e.ts, lines: [], worst: 'ok' }
      groups.push(cur)
      continue
    }
    if (!cur) {
      cur = { id: 0, title: null, ts: e.ts, lines: [], worst: 'ok' }
      groups.push(cur)
    }
    cur.lines.push(e)
    if (e.level === 'error') cur.worst = 'error'
    else if (e.level === 'warn' && cur.worst === 'ok') cur.worst = 'warn'
  }
  return keepEmpty ? groups : groups.filter(g => g.lines.length > 0)
}

/** Filters applied to the lines of the groups (markers always head their group, unless a filter hides the group's every line) */
export function groupedView(entries: LogEntry[], f: Filter): Group[] {
  const filtered = !!((f.tab && f.tab !== 'all') || f.q?.trim() || (f.level && f.level !== 'all') || (f.source && f.source !== 'all'))
  const levels = DETAIL_LEVELS[f.detail ?? 'info']
  // Markers are not lines to filter by tab or search; only the detail level (errors only hides them) applies to them
  const kept = entries.filter(e => (isAction(e) ? levels.includes(e.level) : true))
  const lineIds = new Set(filterEntries(entries.filter(e => !isAction(e)), f).map(e => e.id))
  return groupByAction(kept.filter(e => isAction(e) || lineIds.has(e.id)), !filtered)
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
  if (isAction(e)) return `── ${e.msg} ──`
  return `${formatTime(e.ts)} ${e.level.toUpperCase().padEnd(5)} ${e.source.padEnd(4)} ${e.msg}`
}

/** The action (page change or the like) a line happened under: the latest marker before it */
export function actionOf(entries: LogEntry[], id: number): string | null {
  let title: string | null = null
  for (const e of entries) {
    if (e.id === id) return isAction(e) ? e.msg : title
    if (isAction(e)) title = e.msg
  }
  return null
}

/** What the details pane shows of a line: its fields as JSON */
export function detailsJson(e: LogEntry): string {
  return JSON.stringify(e.data ?? {}, null, 2)
}

/** What Copy writes: the visible lines (flat), or each group's action then its lines */
export function copyText(visible: LogEntry[], groups: Group[] | null): string {
  if (!groups) return visible.map(lineText).join('\n')
  return groups.flatMap(g => [...(g.title ? [`── ${g.title} ──`] : []), ...g.lines.map(lineText)]).join('\n')
}
