/**
 * The debug log (ENG-104): the last 500 lines, in the server's memory only.
 * Nothing goes to disk or the database, and a restart empties it. It is kept on
 * globalThis so a dev reload of this module doesn't drop it. Every message and
 * field is redacted (lib/log/redact.ts) as it is written, so the buffer never
 * holds anything personal in the first place.
 */
import { redact, redactData } from './redact'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogSource = 'app' | 'sync'

export interface LogEntry {
  /** Increasing: a reader asks for the entries after the last id it has */
  id: number
  /** Epoch milliseconds */
  ts: number
  level: LogLevel
  source: LogSource
  msg: string
  data?: Record<string, unknown>
}

export const CAPACITY = 500

interface Store {
  entries: LogEntry[]
  nextId: number
  /** Lines written since the start or the last clear (more than the buffer holds) */
  total: number
  /** Since when `total` counts */
  since: number
}

const KEY = Symbol.for('tazrim.log.buffer')
const g = globalThis as unknown as Record<symbol, Store>
const store: Store = (g[KEY] ??= { entries: [], nextId: 1, total: 0, since: Date.now() })

/** The longest an action's label is kept */
const LABEL_MAX = 80

export function append(level: LogLevel, source: LogSource, msg: string, data?: Record<string, unknown>): LogEntry {
  const entry: LogEntry = {
    id: store.nextId++,
    ts: Date.now(),
    level,
    source,
    msg: redact(msg),
    ...(data && Object.keys(data).length ? { data: redactData(data) } : {}),
  }
  store.entries.push(entry)
  if (store.entries.length > CAPACITY) store.entries.splice(0, store.entries.length - CAPACITY)
  store.total++
  return entry
}

/** The person's action (a page change), the start of a group in the grouped view */
export function appendAction(label: string): LogEntry {
  return append('info', 'app', String(label).slice(0, LABEL_MAX), { action: true })
}

/** Entries with an id above `after` (0 = all kept ones) */
export function entriesAfter(after = 0): LogEntry[] {
  return store.entries.filter(e => e.id > after)
}

export function stats() {
  return { total: store.total, since: store.since, lastId: store.nextId - 1 }
}

export function clear() {
  store.entries = []
  store.total = 0
  store.since = Date.now()
  // Ids keep counting: a reader that already has some never sees an id twice
}

/** Tests: an empty buffer, ids from 1 */
export function resetLog() {
  store.entries = []
  store.nextId = 1
  store.total = 0
  store.since = Date.now()
}
