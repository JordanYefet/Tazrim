/**
 * The app's side of the updater (ENG-98, ENG-136; updater/ in the repo). The updater is a separate
 * container on the compose network: a launcher with a frozen API (api 2) that starts job containers
 * from this app's own image, so the jobs always match this version. The app finds the launcher at
 * TAZRIM_UPDATER_URL and proves itself with the token it writes to <dataDir>/.updater-token. No
 * token file means no updater.
 *
 * What the app asks is `runJob(name, input)`; what it learns about a running or finished job it
 * reads from the status files on the shared volume (status.ts), not from the launcher.
 */
import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './paths'
import { CONFIG_JOBS, CONFIG_STATUS_FILE, currentJob, UPDATE_JOBS, UPDATE_STATUS_FILE } from './status'

export const HELPER_API = 2
const HEALTH_TIMEOUT_MS = 1000
const HEALTH_CACHE_MS = 60_000
/** Above the launcher's own 60 s wait for a job's answer */
const JOB_TIMEOUT_MS = 70_000
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

/** The launcher's own answer. Any api but 2 is an older updater: the page tells how to refresh it once. */
export interface HelperHealth {
  ok: true
  api: number
  launcherVersion: string
}

/** What the `health` job says about the Tazrim container */
export interface HelperTarget {
  updatable: boolean
  image: string
  runningVersion: string | null
  error?: string
}

export const helperIsReady = (health: HelperHealth | null): health is HelperHealth => health?.api === HELPER_API

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
let targetCache: { at: number; value: HelperTarget | null } | null = null
export function resetHelperCache(): void {
  healthCache = null
  targetCache = null
}

/** One call to the launcher with its token; null when there is no token or no answer */
export async function helperCall(method: string, route: string, opts: { body?: unknown; timeoutMs?: number } = {}) {
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

/** Runs a job in the updater and returns its answer { status, json }; null when there is no updater or it did not answer */
export function runJob(name: string, input: unknown = {}, { timeoutMs = JOB_TIMEOUT_MS }: { timeoutMs?: number } = {}) {
  return helperCall('POST', `/v1/jobs/${name}`, { body: input ?? {}, timeoutMs })
}

/**
 * The launcher's health, or null when it is unreachable or refuses our token. Cached 60 s. Any api
 * number comes back (an old updater says 1): callers check helperIsReady.
 */
export async function helperHealth(): Promise<HelperHealth | null> {
  if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS) return healthCache.value
  const r = await helperCall('GET', '/v1/health', { timeoutMs: HEALTH_TIMEOUT_MS })
  const j = r?.json as { ok?: unknown; api?: unknown; launcherVersion?: unknown; helperVersion?: unknown } | null | undefined
  const value: HelperHealth | null =
    r && r.status === 200 && j && j.ok === true && typeof j.api === 'number'
      ? { ok: true, api: j.api, launcherVersion: String(j.launcherVersion ?? j.helperVersion ?? '') }
      : null
  healthCache = { at: Date.now(), value }
  return value
}

/** Was the launcher's health last seen? undefined when unknown or older than the cache; null when it was down */
export function cachedHealth(): HelperHealth | null | undefined {
  return healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS ? healthCache.value : undefined
}

/** What the `health` job says about the app container (can it be updated), or null. Cached 60 s. */
export async function helperTarget(): Promise<HelperTarget | null> {
  if (targetCache && Date.now() - targetCache.at < HEALTH_CACHE_MS) return targetCache.value
  const r = await runJob('health', {}, { timeoutMs: CALL_TIMEOUT_MS })
  const j = r?.json as Partial<HelperTarget> | null | undefined
  const value: HelperTarget | null =
    r && r.status === 200 && j && typeof j === 'object'
      ? { updatable: j.updatable === true, image: typeof j.image === 'string' ? j.image : '', runningVersion: typeof j.runningVersion === 'string' ? j.runningVersion : null, ...(typeof j.error === 'string' ? { error: j.error } : {}) }
      : null
  targetCache = { at: Date.now(), value }
  return value
}

/** The names of the job containers running now (GET /v1/jobs), or null when the launcher did not answer */
export async function helperRunningJobs(): Promise<string[] | null> {
  const r = await helperCall('GET', '/v1/jobs', { timeoutMs: HEALTH_TIMEOUT_MS })
  const running = (r?.json as { running?: unknown } | null | undefined)?.running
  if (!r || r.status !== 200 || !Array.isArray(running)) return null
  return running.map(j => (j && typeof j === 'object' && typeof (j as { name?: unknown }).name === 'string' ? (j as { name: string }).name : ''))
}

/**
 * The current or last update or roll back job, read from its status file. `live` is true only when
 * the launcher answered (so "running" with no job container behind it was settled as failed);
 * otherwise the file is taken as it is, and may be stale, so nothing destructive may rest on it.
 * `skipHelper` doesn't ask the launcher at all.
 */
export async function helperJob(skipHelper = false): Promise<{ job: JobStatus | null; live: boolean }> {
  return currentJob<JobStatus>(UPDATE_STATUS_FILE, UPDATE_JOBS, skipHelper ? null : await helperRunningJobs())
}

export const helperStatus = async (): Promise<JobStatus | null> => (await helperJob()).job

/** The current or last settings job (settings and isolation share the file), raw: the caller keeps only what it shows */
export async function helperConfigJob(): Promise<unknown> {
  return currentJob<{ state?: unknown; steps?: { state?: unknown }[] }>(CONFIG_STATUS_FILE, CONFIG_JOBS, await helperRunningJobs()).job
}

/** Why the helper said no, as a fixed code (its own text is English and may carry Docker output, so it never leaves the server) */
export type HelperRefusal = 'NO_HELPER' | 'BUSY' | 'NOT_NEWER' | 'NOT_UPDATABLE' | 'NO_ROLLBACK' | 'HELPER_ERROR'

export interface HelperResult {
  status: number
  code?: HelperRefusal
}

const HELPER_CODES: readonly HelperRefusal[] = ['BUSY', 'NOT_NEWER', 'NOT_UPDATABLE', 'NO_ROLLBACK']

/** By the job's `code`; a launcher or job that sends none is a plain helper error (except the auth failures) */
function refusal(status: number, code: unknown): HelperRefusal {
  if (status === 401 || status === 403 || status === 404) return 'NO_HELPER'
  if (typeof code === 'string' && (HELPER_CODES as readonly string[]).includes(code)) return code as HelperRefusal
  return 'HELPER_ERROR'
}

async function post(name: 'update' | 'rollback', input: unknown): Promise<HelperResult> {
  const r = await runJob(name, input)
  if (!r) return { status: 503, code: 'NO_HELPER' }
  if (r.status === 202) return { status: 202 }
  const j = r.json as { code?: unknown } | null
  const code = refusal(r.status, j?.code)
  return { status: code === 'NO_HELPER' ? 503 : r.status, code }
}

export const helperStart = (version: string) => post('update', { version })
export const helperRollback = () => post('rollback', {})
