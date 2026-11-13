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

/** The current or last job: from the helper, or from its status file when it can't be reached (the new version reads the outcome this way) */
export async function helperStatus(): Promise<JobStatus | null> {
  const r = await call('GET', '/v1/status', { timeoutMs: HEALTH_TIMEOUT_MS })
  if (r && r.status === 200) return r.json && typeof r.json === 'object' ? (r.json as JobStatus) : null
  return readStatusFile()
}

export interface HelperResult {
  status: number
  error?: string
}

async function post(route: string, body?: unknown): Promise<HelperResult> {
  const r = await call('POST', route, { body: body ?? {} })
  if (!r) return { status: 503, error: 'NO_HELPER' }
  if (r.status === 202) return { status: 202 }
  const error = (r.json as { error?: unknown } | null)?.error
  return { status: r.status, error: typeof error === 'string' ? error : undefined }
}

export const helperStart = (version: string) => post('/v1/update', { version })
export const helperRollback = () => post('/v1/rollback')
