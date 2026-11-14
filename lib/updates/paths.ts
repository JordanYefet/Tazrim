/**
 * Where the database lives and the "updating" flag (ENG-98). Sync fs on purpose:
 * middleware.ts checks the flag on every request.
 */
import fs from 'node:fs'
import path from 'node:path'

/** The folder of the database file in use: /data in Docker, prisma/ in dev (Prisma resolves a relative file: URL against prisma/) */
export function dataDir(): string {
  const url = process.env.TAZRIM_DATABASE_URL
  const prismaDir = path.resolve(process.cwd(), 'prisma')
  if (!url?.startsWith('file:')) return prismaDir
  const file = url.slice('file:'.length).split('?')[0]
  return path.dirname(path.isAbsolute(file) ? file : path.resolve(prismaDir, file))
}

const flagFile = () => path.join(dataDir(), '.updating')

/** While the flag exists, writes are paused (lib/read-only.ts) and syncs refuse to start */
export function setUpdating(on: boolean): void {
  if (on) fs.writeFileSync(flagFile(), new Date().toISOString())
  else fs.rmSync(flagFile(), { force: true })
}

/**
 * A flag older than this is stale: the helper sets it right before the stop and clears it within
 * minutes (restart + a 3-minute health wait), so an old one means the helper died mid-job.
 */
const STALE_MS = 15 * 60 * 1000

/** Is an update pausing writes? A stale flag is removed (and logged) so it can't pause saving, and sign-in, for good. */
export function isUpdating(): boolean {
  let mtime: number
  try {
    mtime = fs.statSync(flagFile()).mtimeMs
  } catch {
    return false
  }
  if (Date.now() - mtime < STALE_MS) return true
  console.warn(`updates: the updating flag is older than ${STALE_MS / 60000} minutes; removing it`)
  fs.rmSync(flagFile(), { force: true })
  return false
}
