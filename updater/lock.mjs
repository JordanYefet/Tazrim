/**
 * The one-job-at-a-time lock (ENG-136). Jobs are separate short-lived containers, so the old
 * in-memory flag can't work: the lock is a file, <dataDir>/.jobs/lock, created with O_EXCL and
 * holding { jobId, name, at }. A lock whose job container is gone (it died without releasing)
 * is stale and is taken over.
 */
import nodeFs from 'node:fs'
import path from 'node:path'
import { readPlain } from './files.mjs'

const { O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = nodeFs.constants

/**
 * @param dir        the .jobs folder (a real folder owned by root)
 * @param jobId      this job's id (the launcher labels its container tazrim.job.id=<jobId>)
 * @param isRunning  async (jobId) => is a container with that job id still running
 */
export function createFileLock({ dir, jobId, name, isRunning, fs = nodeFs, now = () => new Date() }) {
  const file = path.join(dir, 'lock')

  function holder() {
    try {
      const h = JSON.parse(readPlain(file, fs) ?? 'null')
      return h && typeof h.jobId === 'string' ? h : null
    } catch {
      return null
    }
  }

  function create() {
    let fd
    try {
      fd = fs.openSync(file, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
    } catch (e) {
      if (e?.code === 'EEXIST') return false
      throw e
    }
    try {
      fs.writeSync(fd, JSON.stringify({ jobId, name, at: now().toISOString() }))
    } finally {
      fs.closeSync(fd)
    }
    return true
  }

  /** Is the lock held by a job that is still alive? A missing or unreadable lock is not held. */
  async function held() {
    if (!fs.existsSync(file)) return false
    const h = holder()
    if (h?.jobId === jobId) return false
    return h ? await isRunning(h.jobId) : false
  }

  return {
    /** true when this job now holds the lock; false (BUSY) when another live job does */
    async acquire() {
      if (create()) return true
      const h = holder()
      if (h && (await isRunning(h.jobId))) return false
      // Stale (its job is gone) or unreadable: take it over, but only if it is still the same one
      const again = holder()
      if ((again?.jobId ?? null) === (h?.jobId ?? null)) fs.rmSync(file, { force: true })
      return create()
    },
    release() {
      if (holder()?.jobId === jobId) fs.rmSync(file, { force: true })
    },
    /** Is another live job holding it (for what needs "nothing else is running" without taking it) */
    isBusy: held,
  }
}
