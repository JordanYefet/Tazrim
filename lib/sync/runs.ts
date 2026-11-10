/**
 * A sync in progress (ENG-91), held in the server's memory only: one
 * company's, or "sync all" with several side by side. The page starts one
 * with a login and then polls it. The login lives
 * only inside the running scrape and is blanked as soon as the site has
 * answered; the fetched rows wait here only while the person links unknown
 * accounts, and are dropped once stored.
 */
import { randomUUID } from 'node:crypto'
import type { ScrapedAccount } from './map'
import type { SyncCompany } from './providers'
import { scrape, type ScrapeErrorCode, type ScrapeStep } from './scrape'
import {
  chosenAccounts,
  findLinks,
  linkCandidates,
  planLinks,
  saveLinks,
  storeScrape,
  type AccountResult,
  type Candidate,
  type LinkAction,
  type UnknownAccount,
} from './store'
import { lastFour } from './map'
import { localDay } from '@/lib/upload/card-dedupe'

/** How long a sync waits for an SMS code */
const OTP_TIMEOUT_MS = 3 * 60_000
/** How long a sync waits for the person to link unknown accounts */
const LINKS_TIMEOUT_MS = 15 * 60_000

export type RunState =
  | { state: 'running'; step: ScrapeStep | 'storing' }
  | { state: 'needs-code' }
  | { state: 'needs-links'; unknown: UnknownAccount[]; candidates: Candidate[] }
  | { state: 'done'; results: AccountResult[] }
  | { state: 'failed'; code: ScrapeErrorCode | 'STORE' | 'EXPIRED'; /** The step it failed in */ at?: ScrapeStep | 'storing' | 'code' }

export interface RunView {
  id: string
  company: string
  startedAt: string
  /** The start date asked for, YYYY-MM-DD */
  startDate: string
  finishedAt: string | null
  status: RunState
}

interface Run {
  id: string
  company: SyncCompany
  startedAt: Date
  startDate: Date
  finishedAt: Date | null
  status: RunState
  /** Its headless browser is open: from the start until the scrape returns */
  browser: boolean
  /** Told when the browser closes and when the run ends ("sync all" fills the free slot) */
  onChange?: () => void
  otp?: (code: string) => void
  scraped?: ScrapedAccount[]
  timer?: ReturnType<typeof setTimeout>
}

/** One company in "sync all", as the sheet shows it */
export interface QueueItemView {
  company: string
  state: 'waiting' | 'running' | 'done' | 'failed' | 'skipped'
  /** Its run once it started: the step, or what it waits for (a code, links) */
  run?: RunView
  /** New rows, once done */
  created?: number
  /** Why it failed or was skipped: a FAILURE_TEXT key, or VAULT_LOCKED */
  code?: string
}

export interface QueueView {
  id: string
  items: QueueItemView[]
  finishedAt: string | null
}

/** Where a queued company's login comes from: read only when its turn comes (the vault, ENG-92) */
export type LoginSource = () => Promise<Record<string, string> | 'VAULT_LOCKED' | null>

interface QueueItem {
  company: SyncCompany
  startDate: Date
  login: LoginSource
  /** Its login is being read */
  reading?: boolean
  run?: Run
  /** Set when it never started: its login couldn't be read */
  skipped?: string
}

interface Queue {
  id: string
  items: QueueItem[]
  /** The next item to start */
  next: number
  finishedAt: Date | null
}

interface Registry {
  /** The latest single sync (not one of "sync all") */
  current: Run | null
  /** Every run since the last start, by id: the single one, or those of "sync all" */
  runs: Map<string, Run>
  queue?: Queue | null
  /** The tail of the writes: runs store one at a time */
  writing?: Promise<unknown>
}

// One registry per server process (and across dev hot reloads)
const KEY = Symbol.for('tazrim.sync.runs')
const g = globalThis as unknown as Record<symbol, Registry>
const registry: Registry = (g[KEY] ??= { current: null, runs: new Map() })
registry.runs ??= new Map()

const active = (r: Run | null | undefined) => !!r && (r.status.state === 'running' || r.status.state === 'needs-code' || r.status.state === 'needs-links')

/** How many companies "sync all" runs at once: each opens its own headless browser (TAZRIM_SYNC_CONCURRENCY, default 3) */
export function syncConcurrency(): number {
  const n = Number(process.env.TAZRIM_SYNC_CONCURRENCY)
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 8) : 3
}

/**
 * Runs a write after the ones before it: two runs never store at once, so
 * their de-dup reads and writes can't interleave (and SQLite takes one writer anyway).
 */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = (registry.writing ?? Promise.resolve()).then(fn, fn)
  registry.writing = next.catch(() => {})
  return next
}

function view(r: Run): RunView {
  return {
    id: r.id,
    company: r.company.id,
    startedAt: r.startedAt.toISOString(),
    startDate: localDay(r.startDate),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    status: r.status,
  }
}

function finish(run: Run, status: RunState) {
  if (run.finishedAt) return
  if (run.timer) clearTimeout(run.timer)
  run.timer = undefined
  run.otp = undefined
  run.scraped = undefined
  run.status = status
  run.finishedAt = new Date()
  run.onChange?.()
}

const queueActive = () => !!registry.queue && !registry.queue.finishedAt
const anyActive = () => [...registry.runs.values()].some(active) || queueActive()

/** The latest single sync, finished or not ("sync all" shows in currentQueue). */
export function currentRun(): RunView | null {
  return registry.current ? view(registry.current) : null
}

export function getRun(id: string): RunView | null {
  const run = registry.runs.get(id)
  return run ? view(run) : null
}

export type StartResult = { ok: true; run: RunView } | { ok: false; code: 'BUSY' }

/** Starts a sync; the login is handed to the scrape and blanked once the site has answered. */
export function startRun(company: SyncCompany, credentials: Record<string, string>, startDate: Date): StartResult {
  if (anyActive()) return { ok: false, code: 'BUSY' }
  registry.queue = null
  registry.runs = new Map()
  const run = launch(company, credentials, startDate)
  registry.current = run
  return { ok: true, run: view(run) }
}

function launch(company: SyncCompany, credentials: Record<string, string>, startDate: Date, onChange?: () => void): Run {
  const run: Run = {
    id: randomUUID(),
    company,
    startedAt: new Date(),
    startDate,
    finishedAt: null,
    status: { state: 'running', step: 'starting' },
    browser: true,
    onChange,
  }
  registry.runs.set(run.id, run)
  void execute(run, credentials, startDate)
  return run
}

// ── "Sync all" (ENG-92) ────────────────────────────────────────────────

function itemView(i: QueueItem): QueueItemView {
  const base = { company: i.company.id }
  if (i.skipped) return { ...base, state: 'skipped', code: i.skipped }
  if (!i.run) return { ...base, state: i.reading ? 'running' : 'waiting' }
  const s = i.run.status
  const run = view(i.run)
  if (s.state === 'done') return { ...base, state: 'done', run, created: s.results.reduce((n, r) => n + r.created, 0) }
  if (s.state === 'failed') return { ...base, state: 'failed', run, code: s.code }
  return { ...base, state: 'running', run }
}

export function currentQueue(): QueueView | null {
  const q = registry.queue
  return q ? { id: q.id, items: q.items.map(itemView), finishedAt: q.finishedAt?.toISOString() ?? null } : null
}

export type QueueStart = { ok: true; queue: QueueView } | { ok: false; code: 'BUSY' | 'EMPTY' }

/**
 * Syncs several companies side by side, up to syncConcurrency() at once (each
 * scrape opens its own browser), each with a login read only when its turn
 * comes. A company whose login can't be read (the vault locked meanwhile) is
 * skipped and the rest go on. A run waiting for links has closed its browser,
 * so the next company starts; one waiting for an SMS code keeps its slot (its
 * browser waits too) while the others go on.
 */
export async function startQueue(items: { company: SyncCompany; startDate: Date; login: LoginSource }[]): Promise<QueueStart> {
  if (anyActive()) return { ok: false, code: 'BUSY' }
  if (!items.length) return { ok: false, code: 'EMPTY' }
  registry.current = null
  registry.runs = new Map()
  const q: Queue = { id: randomUUID(), items: items.map(i => ({ ...i })), next: 0, finishedAt: null }
  registry.queue = q
  // The first ones have started (or were skipped) by the time this answers
  await Promise.all(pump(q))
  return { ok: true, queue: currentQueue()! }
}

/** Items holding a browser, or about to (their login being read) */
const slotsTaken = (q: Queue) => q.items.filter(i => i.reading || i.run?.browser).length
const settled = (i: QueueItem) => !!i.skipped || (!!i.run && !!i.run.finishedAt)

/** Starts companies while there are free slots; ends the queue once every company has. Returns the starts it made. */
function pump(q: Queue): Promise<void>[] {
  if (registry.queue !== q || q.finishedAt) return []
  const started: Promise<void>[] = []
  while (q.next < q.items.length && slotsTaken(q) < syncConcurrency()) {
    const item = q.items[q.next++]
    item.reading = true
    started.push(startItem(q, item))
  }
  if (q.next >= q.items.length && q.items.every(settled)) q.finishedAt = new Date()
  return started
}

async function startItem(q: Queue, item: QueueItem) {
  const login = await item.login().catch(() => null)
  item.reading = false
  if (login && typeof login === 'object') item.run = launch(item.company, login, item.startDate, () => void pump(q))
  else item.skipped = login === 'VAULT_LOCKED' ? 'VAULT_LOCKED' : 'GENERIC'
  pump(q)
}

async function execute(run: Run, credentials: Record<string, string>, startDate: Date) {
  const result = await scrape({
    company: run.company,
    credentials,
    startDate,
    onStep: step => {
      if (run.status.state === 'running' || run.status.state === 'needs-code') run.status = { state: 'running', step }
    },
    requestOtp: () =>
      new Promise<string>((resolve, reject) => {
        run.status = { state: 'needs-code' }
        run.timer = setTimeout(() => reject(new Error('OTP_TIMEOUT')), OTP_TIMEOUT_MS)
        run.otp = code => {
          clearTimeout(run.timer)
          run.otp = undefined
          run.status = { state: 'running', step: 'logging-in' }
          resolve(code)
        }
      }),
  }).catch(() => ({ ok: false as const, code: 'GENERIC' as const }))
  for (const k of Object.keys(credentials)) credentials[k] = ''
  run.browser = false
  run.onChange?.()
  // Cancelled while it waited for the code: it ended already
  if (run.finishedAt) return

  if (!result.ok) {
    const at = run.status.state === 'running' ? run.status.step : run.status.state === 'needs-code' ? 'code' : undefined
    return finish(run, { state: 'failed', code: result.code, ...(at ? { at } : {}) })
  }
  run.scraped = result.accounts
  await linkOrStore(run)
}

/** Asks about site accounts with no link yet; stores once every one has one. */
async function linkOrStore(run: Run) {
  const scraped = run.scraped ?? []
  try {
    const links = await findLinks(
      run.company,
      scraped.map(a => a.accountNumber)
    )
    const missing = scraped
      .filter(a => !links.some(l => l.externalAccount === a.accountNumber))
      .map(a => ({ externalAccount: a.accountNumber, rows: a.txns.filter(t => t.status !== 'pending').length }))
    if (missing.length) {
      const candidates = await linkCandidates(run.company)
      // The accounts chosen on the company's saved sign-ins settle what they can without asking
      const plan = planLinks(run.company, scraped.length, missing, candidates, await chosenAccounts(run.company))
      if (plan.auto.length) await saveLinks(run.company, plan.auto)
      if (plan.ask.length) {
        run.status = {
          state: 'needs-links',
          candidates,
          unknown: plan.ask.map(a => ({
            externalAccount: a.externalAccount,
            label: run.company.kind === 'CREDIT_CARD' ? lastFour(a.externalAccount) : a.externalAccount,
            rows: missing.find(m => m.externalAccount === a.externalAccount)!.rows,
            suggestedAccountId: a.suggestedAccountId,
          })),
        }
        run.timer = setTimeout(() => finish(run, { state: 'failed', code: 'EXPIRED' }), LINKS_TIMEOUT_MS)
        return
      }
    }
    run.status = { state: 'running', step: 'storing' }
    const results = await exclusive(() => storeScrape(run.company, scraped))
    finish(run, { state: 'done', results })
  } catch {
    finish(run, { state: 'failed', code: 'STORE', at: 'storing' })
  }
}

/** The SMS code for a run that waits for one. */
export function submitCode(id: string, code: string): boolean {
  const run = registry.runs.get(id)
  if (!run || run.status.state !== 'needs-code' || !run.otp) return false
  run.otp(code)
  return true
}

export type LinksResult = { ok: true } | { ok: false; code: 'NOT_WAITING' | 'INVALID' }

/** The person's answers for the unknown accounts; the run then stores. */
export async function submitLinks(id: string, actions: LinkAction[]): Promise<LinksResult> {
  const run = registry.runs.get(id)
  if (!run || run.status.state !== 'needs-links') return { ok: false, code: 'NOT_WAITING' }
  const wanted = new Set(run.status.unknown.map(u => u.externalAccount))
  if (actions.length !== wanted.size || !actions.every(a => wanted.has(a.externalAccount))) return { ok: false, code: 'INVALID' }
  if (run.timer) clearTimeout(run.timer)
  run.timer = undefined
  try {
    await exclusive(() => saveLinks(run.company, actions))
  } catch {
    return { ok: false, code: 'INVALID' }
  }
  run.status = { state: 'running', step: 'storing' }
  void linkOrStore(run)
  return { ok: true }
}

/** Stops waiting (for a code or for links); nothing is stored. */
export function cancelRun(id: string): boolean {
  const run = registry.runs.get(id)
  if (!run || !active(run) || run.status.state === 'running') return false
  // An empty code makes the site refuse at once, so the browser closes instead of waiting
  run.otp?.('')
  finish(run, { state: 'failed', code: 'EXPIRED' })
  return true
}

/** Tests: forget every run. */
export function resetRuns() {
  for (const r of registry.runs.values()) if (r.timer) clearTimeout(r.timer)
  registry.current = null
  registry.runs = new Map()
  registry.queue = null
}
