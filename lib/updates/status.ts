/**
 * The job status files on the data volume (ENG-98/136): the app reads them directly (the same
 * volume the jobs write to), instead of asking the updater. A job that died in the middle leaves
 * "running" behind; the app settles that in memory when the launcher says no such job runs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './paths'

export const UPDATE_STATUS_FILE = '.update-status.json'
export const CONFIG_STATUS_FILE = '.config-status.json'

/** The job names whose work shows in each status file */
export const UPDATE_JOBS: readonly string[] = ['update', 'rollback']
export const CONFIG_JOBS: readonly string[] = ['config', 'egress-on', 'egress-approve-finish']

interface Settleable {
  state?: unknown
  error?: unknown
  steps?: { state?: unknown }[]
}

/** A job that was running when its container died can't be resumed: it reads as failed */
export function settle<T extends Settleable>(s: T | null): T | null {
  if (!s || typeof s !== 'object' || s.state !== 'running') return s
  return {
    ...s,
    state: 'failed',
    error: s.error ?? 'The updater stopped in the middle of the job.',
    steps: (s.steps ?? []).map(step => (step.state === 'running' ? { ...step, state: 'failed' } : step)),
    finishedAt: new Date().toISOString(),
  }
}

/** A status file's object (with its steps), or null when missing, unreadable or another shape */
export function readStatusFile<T extends Settleable>(file: string): T | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dataDir(), file), 'utf8')) as T | null
    return j && typeof j === 'object' && Array.isArray(j.steps) ? j : null
  } catch {
    return null
  }
}

/**
 * The file's job, settled when it says running but the launcher shows no running job of its kinds.
 * `running` is the launcher's list (job names), or null when it did not answer: then the file is
 * taken as it is, and `live` is false.
 */
export function currentJob<T extends Settleable>(file: string, kinds: readonly string[], running: readonly string[] | null): { job: T | null; live: boolean } {
  const job = readStatusFile<T>(file)
  if (running === null) return { job, live: false }
  return { job: job?.state === 'running' && !running.some(n => kinds.includes(n)) ? settle(job) : job, live: true }
}
