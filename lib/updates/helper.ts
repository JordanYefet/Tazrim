/**
 * The app's side of the updater helper (ENG-98; updater/ in the repo). The helper is a
 * separate container on the compose network; the app finds it at TAZRIM_UPDATER_URL and
 * proves itself with the token the helper writes to <dataDir>/.updater-token. No token
 * file means no helper. The shapes mirror updater/job.mjs and updater/server.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './paths'

export const HELPER_API = 1
const HEALTH_TIMEOUT_MS = 1000
const HEALTH_CACHE_MS = 60_000
const CALL_TIMEOUT_MS = 10_000

export type StepId = 'backup' | 'download' | 'restart' | 'migrate' | 'check' | 'restore'
export interface JobStep {
  id: StepId
  state: 'waiting' | 'running' | 'done' | 'failed'
}

export interface JobStatus {
  kind: 'update' | 'rollback'
  from: string
  to: string
  state: 'running' | 'done' | 'failed'
  /** The previous version is running again (not necessarily that data was restored) */
  restored: boolean
  steps: JobStep[]
  error?: string
  finishedAt?: string
  downloaded?: { current: number; total: number }
  /** Path of the pre-update backup, in the helper's words; never sent to the browser */
  backup?: string
  previousImage?: string
}

export interface HelperHealth {
  ok: true
  helperVersion: string
  api: number
  updatable: boolean
  image: string
  runningVersion: string | null
  error?: string
}

export function helperUrl(): string {
  return (process.env.TAZRIM_UPDATER_URL || 'http://updater:8080').replace(/\/+$/, '')
}

export function readToken(): string | null {
  try {
    const t = fs.readFileSync(path.join(dataDir(), '.updater-token'), 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}

let healthCache: { at: number; value: HelperHealth | null } | null = null
export function resetHelperCache(): void {
  healthCache = null
}

async function call(method: string, route: string, opts: { body?: unknown; timeoutMs?: number } = {}) {
  const token = readToken()
  if (!token) return null
  try {
    const res = await fetch(`${helperUrl()}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? CALL_TIMEOUT_MS),
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as unknown
    return { status: res.status, json }
  } catch {
    return null
  }
}

/** The helper's health, or null when it is unreachable, refuses our token, or speaks another API. Cached 60 s. */
export async function helperHealth(): Promise<HelperHealth | null> {
  if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS) return healthCache.value
  const r = await call('GET', '/v1/health', { timeoutMs: HEALTH_TIMEOUT_MS })
  const j = r?.json as Partial<HelperHealth> | null | undefined
  const value = r && r.status === 200 && j && j.ok === true && j.api === HELPER_API ? (j as HelperHealth) : null
  healthCache = { at: Date.now(), value }
  return value
}

function readStatusFile(): JobStatus | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dataDir(), '.update-status.json'), 'utf8')) as JobStatus | null
    return j && typeof j === 'object' && Array.isArray(j.steps) ? j : null
  } catch {
    return null
  }
}

/** Was the helper's health last seen? undefined when unknown or older than the cache; null when it was down */
export function cachedHealth(): HelperHealth | null | undefined {
  return healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS ? healthCache.value : undefined
}

/**
 * The current or last job. `live` is true only when the helper itself answered; otherwise
 * the job is read from its status file (how the new version reads the outcome), which may be
 * stale, so nothing destructive may rest on it. `skipHelper` goes straight to the file.
 */
export async function helperJob(skipHelper = false): Promise<{ job: JobStatus | null; live: boolean }> {
  if (!skipHelper) {
    const r = await call('GET', '/v1/status', { timeoutMs: HEALTH_TIMEOUT_MS })
    if (r && r.status === 200) return { job: r.json && typeof r.json === 'object' ? (r.json as JobStatus) : null, live: true }
  }
  return { job: readStatusFile(), live: false }
}

export const helperStatus = async (): Promise<JobStatus | null> => (await helperJob()).job

/** Why the helper said no, as a fixed code (its own text is English and may carry Docker output, so it never leaves the server) */
export type HelperRefusal = 'NO_HELPER' | 'BUSY' | 'NOT_NEWER' | 'NOT_UPDATABLE' | 'NO_ROLLBACK' | 'HELPER_ERROR'

export interface HelperResult {
  status: number
  code?: HelperRefusal
}

const HELPER_CODES: readonly HelperRefusal[] = ['BUSY', 'NOT_NEWER', 'NOT_UPDATABLE', 'NO_ROLLBACK']

/** By the helper's `code` when it sends one; older helpers only send text, so then by status and text */
function refusal(kind: 'update' | 'rollback', status: number, text: string, code: unknown): HelperRefusal {
  if (status === 401 || status === 403) return 'NO_HELPER'
  if (typeof code === 'string') return (HELPER_CODES as readonly string[]).includes(code) ? (code as HelperRefusal) : 'HELPER_ERROR'
  if (status === 409) return /already running/i.test(text) ? 'BUSY' : kind === 'rollback' ? 'NO_ROLLBACK' : 'BUSY'
  if (status === 400) return kind === 'update' ? 'NOT_NEWER' : 'HELPER_ERROR'
  if (status === 422) return 'NOT_UPDATABLE'
  if (status === 401 || status === 403) return 'NO_HELPER'
  return 'HELPER_ERROR'
}

async function post(kind: 'update' | 'rollback', route: string, body?: unknown): Promise<HelperResult> {
  const r = await call('POST', route, { body: body ?? {} })
  if (!r) return { status: 503, code: 'NO_HELPER' }
  if (r.status === 202) return { status: 202 }
  const j = r.json as { error?: unknown; code?: unknown } | null
  const code = refusal(kind, r.status, typeof j?.error === 'string' ? j.error : '', j?.code)
  return { status: code === 'NO_HELPER' ? 503 : r.status, code }
}

export const helperStart = (version: string) => post('update', '/v1/update', { version })
export const helperRollback = () => post('rollback', '/v1/rollback')
