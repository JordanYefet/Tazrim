/** What the update card shows (ENG-98): the check's cache, the helper, the job, and the last update. */
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/db/client'
import { isSyncActive } from '@/lib/sync/runs'
import { CURRENT_VERSION, getUpdateCache, type UpdateCache } from './check'
import { cachedHealth, helperHealth, helperJob, type JobStatus } from './helper'
import { dataDir, isUpdating, setUpdating } from './paths'
import { getAutoCheck } from './settings'
import { isNewer, type ReleaseInfo } from './version'

export const LAST_KEY = 'updates.last'

export interface LastUpdate {
  from: string
  to: string
  /** When the update finished: also what makes recording it once */
  at: string
  canRollBack: boolean
  /** When the pre-update backup was taken */
  backupAt: string
  /** Saved since the backup: what a roll back would lose */
  since: { uploads: number; transactions: number }
}

export interface UpdateView {
  current: string
  latest: ReleaseInfo | null
  newer: boolean
  checkedAt: string | null
  error: UpdateCache['error']
  auto: boolean
  canUpdate: boolean
  syncRunning: boolean
  job: JobStatus | null
  lastUpdate: LastUpdate | null
}

type StoredLast = { from: string; to: string; at: string; backupAt: string }

/** "pre-update-v1.0.0-to-v1.2.0-20261113-091400.db" -> the time in its name (server local time), or null */
function backupTime(file: string | undefined): string | null {
  const m = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/.exec(file ?? '')
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** Is the job's pre-update backup still there? Same volume and path in both containers; checked by its name in our backups folder. */
function backupPresent(file: string | undefined): boolean {
  if (!file) return false
  try {
    return fs.statSync(path.join(dataDir(), 'backups', path.basename(file))).isFile()
  } catch {
    return false
  }
}

async function readLast(): Promise<StoredLast | null> {
  const row = await prisma.setting.findUnique({ where: { key: LAST_KEY } })
  if (!row) return null
  try {
    const v = JSON.parse(row.value) as Partial<StoredLast>
    return v.from && v.to && v.at && v.backupAt ? (v as StoredLast) : null
  } catch {
    return null
  }
}

/** A finished job changes what "last update" is: once per job (an update sets it, a roll back clears it) */
async function recordFinished(job: JobStatus | null): Promise<void> {
  if (!job || job.state !== 'done' || !job.finishedAt) return
  const stored = await readLast()
  if (job.kind === 'rollback') {
    if (stored) await prisma.setting.deleteMany({ where: { key: LAST_KEY } })
    return
  }
  if (stored?.at === job.finishedAt) return
  const value = JSON.stringify({
    from: job.from,
    to: job.to,
    at: job.finishedAt,
    backupAt: backupTime(job.backup) ?? job.finishedAt,
  } satisfies StoredLast)
  await prisma.setting.upsert({ where: { key: LAST_KEY }, create: { key: LAST_KEY, value }, update: { value } })
}

/** Rows saved after the backup. Only uploads (files and syncs) carry a time, so transactions are counted by their record counts. */
async function savedSince(backupAt: string): Promise<LastUpdate['since']> {
  const after = new Date(backupAt)
  const [uploads, sum] = await Promise.all([
    prisma.uploadHistory.count({ where: { uploadedAt: { gt: after } } }),
    prisma.uploadHistory.aggregate({ where: { uploadedAt: { gt: after } }, _sum: { recordCount: true } }),
  ])
  return { uploads, transactions: sum._sum.recordCount ?? 0 }
}

export async function getUpdateView(): Promise<UpdateView> {
  // A helper known to be down costs no call; otherwise health and status are asked together
  const down = cachedHealth() === null
  const [cache, auto, health, { job, live }] = await Promise.all([getUpdateCache(), getAutoCheck(), helperHealth(), helperJob(down)])
  await recordFinished(job)

  // Self-heal: a flag left behind (the helper died before clearing it) would pause saving for good.
  // Only on the helper's own live answer: the status file can be stale while a job really runs.
  if (live && health && isUpdating() && job?.state !== 'running') {
    console.warn('updates: the updating flag was left behind and no job runs; clearing it')
    setUpdating(false)
  }

  const canUpdate = !!health && health.updatable
  const stored = await readLast()
  const lastUpdate: LastUpdate | null = stored
    ? {
        ...stored,
        canRollBack: canUpdate && job?.state !== 'running' && !!job && job.kind === 'update' && job.state === 'done' && job.finishedAt === stored.at && backupPresent(job.backup),
        since: await savedSince(stored.backupAt),
      }
    : null

  // Paths, image ids and the helper's error text stay on the server: the card words the reason from the failed step
  const safeJob = job && Object.fromEntries(Object.entries(job).filter(([k]) => k !== 'backup' && k !== 'previousImage' && k !== 'error'))
  return {
    current: CURRENT_VERSION,
    latest: cache.latest,
    newer: !!cache.latest && isNewer(cache.latest.version, CURRENT_VERSION),
    checkedAt: cache.checkedAt,
    error: cache.error,
    auto,
    canUpdate,
    syncRunning: isSyncActive(),
    job: safeJob ? (safeJob as unknown as JobStatus) : null,
    lastUpdate,
  }
}
