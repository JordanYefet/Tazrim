/**
 * A sync in progress (ENG-91), held in the server's memory only: one at a
 * time. The page starts one with a login and then polls it. The login lives
 * only inside the running scrape and is blanked as soon as the site has
 * answered; the fetched rows wait here only while the person links unknown
 * accounts, and are dropped once stored.
 */
import { randomUUID } from 'node:crypto'
import type { ScrapedAccount } from './map'
import type { SyncCompany } from './providers'
import { scrape, type ScrapeErrorCode, type ScrapeStep } from './scrape'
import {
  findLinks,
  linkCandidates,
  saveLinks,
  storeScrape,
  suggestAccount,
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
  | { state: 'failed'; code: ScrapeErrorCode | 'STORE' | 'EXPIRED' }

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
  otp?: (code: string) => void
  scraped?: ScrapedAccount[]
  timer?: ReturnType<typeof setTimeout>
}

interface Registry {
  current: Run | null
}

// One registry per server process (and across dev hot reloads)
const KEY = Symbol.for('tazrim.sync.runs')
const g = globalThis as unknown as Record<symbol, Registry>
const registry: Registry = (g[KEY] ??= { current: null })

const active = (r: Run | null) => !!r && (r.status.state === 'running' || r.status.state === 'needs-code' || r.status.state === 'needs-links')

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
  if (run.timer) clearTimeout(run.timer)
  run.timer = undefined
  run.otp = undefined
  run.scraped = undefined
  run.status = status
  run.finishedAt = new Date()
}

/** The latest run, finished or not. */
export function currentRun(): RunView | null {
  return registry.current ? view(registry.current) : null
}

export function getRun(id: string): RunView | null {
  return registry.current?.id === id ? view(registry.current) : null
}

export type StartResult = { ok: true; run: RunView } | { ok: false; code: 'BUSY' }

/** Starts a sync; the login is handed to the scrape and blanked once the site has answered. */
export function startRun(company: SyncCompany, credentials: Record<string, string>, startDate: Date): StartResult {
  if (active(registry.current)) return { ok: false, code: 'BUSY' }
  const run: Run = { id: randomUUID(), company, startedAt: new Date(), startDate, finishedAt: null, status: { state: 'running', step: 'starting' } }
  registry.current = run
  void execute(run, credentials, startDate)
  return { ok: true, run: view(run) }
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

  if (!result.ok) return finish(run, { state: 'failed', code: result.code })
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
    const missing = scraped.filter(a => !links.some(l => l.externalAccount === a.accountNumber))
    if (missing.length) {
      const candidates = await linkCandidates(run.company)
      run.status = {
        state: 'needs-links',
        candidates,
        unknown: missing.map(a => ({
          externalAccount: a.accountNumber,
          label: run.company.kind === 'CREDIT_CARD' ? lastFour(a.accountNumber) : a.accountNumber,
          rows: a.txns.filter(t => t.status !== 'pending').length,
          suggestedAccountId: suggestAccount(run.company, a.accountNumber, candidates),
        })),
      }
      run.timer = setTimeout(() => finish(run, { state: 'failed', code: 'EXPIRED' }), LINKS_TIMEOUT_MS)
      return
    }
    run.status = { state: 'running', step: 'storing' }
    const results = await storeScrape(run.company, scraped)
    finish(run, { state: 'done', results })
  } catch {
    finish(run, { state: 'failed', code: 'STORE' })
  }
}

/** The SMS code for a run that waits for one. */
export function submitCode(id: string, code: string): boolean {
  const run = registry.current
  if (!run || run.id !== id || run.status.state !== 'needs-code' || !run.otp) return false
  run.otp(code)
  return true
}

export type LinksResult = { ok: true } | { ok: false; code: 'NOT_WAITING' | 'INVALID' }

/** The person's answers for the unknown accounts; the run then stores. */
export async function submitLinks(id: string, actions: LinkAction[]): Promise<LinksResult> {
  const run = registry.current
  if (!run || run.id !== id || run.status.state !== 'needs-links') return { ok: false, code: 'NOT_WAITING' }
  const wanted = new Set(run.status.unknown.map(u => u.externalAccount))
  if (actions.length !== wanted.size || !actions.every(a => wanted.has(a.externalAccount))) return { ok: false, code: 'INVALID' }
  if (run.timer) clearTimeout(run.timer)
  run.timer = undefined
  try {
    await saveLinks(run.company, actions)
  } catch {
    return { ok: false, code: 'INVALID' }
  }
  run.status = { state: 'running', step: 'storing' }
  void linkOrStore(run)
  return { ok: true }
}

/** Stops waiting (for a code or for links); nothing is stored. */
export function cancelRun(id: string): boolean {
  const run = registry.current
  if (!run || run.id !== id || !active(run) || run.status.state === 'running') return false
  // An empty code makes the site refuse at once, so the browser closes instead of waiting
  run.otp?.('')
  finish(run, { state: 'failed', code: 'EXPIRED' })
  return true
}

/** Tests: forget the current run. */
export function resetRuns() {
  if (registry.current?.timer) clearTimeout(registry.current.timer)
  registry.current = null
}
