/** A copy of the database before an update (ENG-98), so a bad release can be rolled back. */
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/db/client'
import { dataDir } from './paths'

const PREFIX = 'pre-update-'
const backupsDir = () => path.join(dataDir(), 'backups')

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

/** Deletes all but the newest `keep` pre-update backups (by name: it ends in the time); returns the paths deleted */
export async function pruneBackups(keep = 5): Promise<string[]> {
  const dir = backupsDir()
  if (!fs.existsSync(dir)) return []
  const mine = fs
    .readdirSync(dir)
    .filter(f => f.startsWith(PREFIX) && f.endsWith('.db'))
    .sort((a, b) => stamped(a).localeCompare(stamped(b)) || a.localeCompare(b))
  const doomed = mine.slice(0, Math.max(0, mine.length - keep)).map(f => path.join(dir, f))
  for (const f of doomed) fs.rmSync(f, { force: true })
  return doomed
}

/** The "YYYYMMDD-HHmmss" a backup's name ends in */
const stamped = (name: string) => /(\d{8}-\d{6})\.db$/.exec(name)?.[1] ?? ''

/** VACUUM INTO a new file in <dataDir>/backups, then prunes to the newest 5. Returns its absolute path. */
export async function takeBackup(from: string, to: string, now = new Date()): Promise<string> {
  const dir = backupsDir()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${PREFIX}v${from}-to-v${to}-${stamp(now)}.db`)
  fs.rmSync(file, { force: true }) // VACUUM INTO refuses an existing file
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  await pruneBackups(5)
  return file
}
