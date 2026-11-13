/**
 * The app port for the update jobs (ENG-98): asking the Tazrim app for a backup and to clear
 * its "updating" flag (HTTP, bearer token), and the file work on the shared data volume that
 * only happens while the app is stopped (restoring a backup, setting the live database aside).
 */
import nodeFs from 'node:fs'
import path from 'node:path'
import { copyNew, isRealFile, realDir } from './files.mjs'

const BACKUP_NAME = /^pre-update-v[\w.]+-to-v[\w.]+-\d{8}-\d{6}\.db$/
const BACKUP_TIMEOUT_MS = 2 * 60 * 1000
const CLEAR_TIMEOUT_MS = 5 * 1000
/** How many before-rollback-<time> folders to keep */
const KEEP_SET_ASIDE = 3
const SET_ASIDE_NAME = /^before-rollback-\d{8}-\d{6}$/
/** The app runs as user node */
const APP_OWNER = { uid: 1000, gid: 1000 }

const pad = n => String(n).padStart(2, '0')
const stamp = d =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

/**
 * @param url      the app, e.g. http://tazrim:3000
 * @param dbFile   the database file on the helper's mount of the data volume, e.g. /data/tazrim.db
 * @param owner    who restored files belong to; null leaves them as they are (tests)
 */
export function createApp({ url, token, dbFile, fetchImpl = fetch, fs = nodeFs, owner = APP_OWNER, now = () => new Date() }) {
  const dataDir = path.dirname(dbFile)
  const backupsDir = path.join(dataDir, 'backups')
  const sidecars = ['-wal', '-shm', '-journal'].map(s => dbFile + s)
  const endpoint = `${url.replace(/\/+$/, '')}/api/updates/backup`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  /** A plain, non-empty file: a symlink planted in the app's folder never counts */
  const isNonEmptyFile = file => isRealFile(file, fs) && fs.lstatSync(file).size > 0

  /** Only files directly in a real <dataDir>/backups folder with a pre-update name */
  const isOurBackup = file => {
    if (path.dirname(path.resolve(file)) !== backupsDir || !BACKUP_NAME.test(path.basename(file))) return false
    try {
      realDir(backupsDir, fs)
      return true
    } catch {
      return false
    }
  }

  /** Keeps the newest few before-rollback folders (their names end in the local time) */
  const pruneSetAside = () => {
    const doomed = fs
      .readdirSync(backupsDir)
      .filter(n => SET_ASIDE_NAME.test(n))
      .sort()
      .slice(0, -KEEP_SET_ASIDE)
    for (const n of doomed) fs.rmSync(path.join(backupsDir, n), { recursive: true, force: true })
  }

  return {
    /** The app pauses writes, takes the backup, and answers with its path; returns the same file on this side's mount */
    async requestBackup(from, to) {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ from, to }),
        signal: AbortSignal.timeout(BACKUP_TIMEOUT_MS),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body?.code === 'SYNC_RUNNING') {
        throw Object.assign(new Error('A bank sync is running. Try again when it ends.'), { code: 'SYNC_RUNNING' })
      }
      if (!res.ok || typeof body?.file !== 'string') throw new Error(`the app answered ${res.status}`)
      // The app sees the volume at its own path; only the name is trusted, and it must look like a backup's
      const name = path.posix.basename(body.file)
      if (!BACKUP_NAME.test(name)) throw new Error('the app named an unexpected backup file')
      const local = path.join(backupsDir, name)
      if (!isOurBackup(local) || !isNonEmptyFile(local)) throw new Error('the backup file is missing or empty')
      return local
    },

    /** Lifts the app's write pause; removes the flag file directly when the app doesn't answer */
    async clearFlag() {
      try {
        await fetchImpl(endpoint, { method: 'DELETE', headers, signal: AbortSignal.timeout(CLEAR_TIMEOUT_MS) })
      } catch {
        // the app is down or restarting: the flag file is on our volume too
      } finally {
        fs.rmSync(path.join(dataDir, '.updating'), { force: true })
      }
    },

    backupExists: file => isOurBackup(file) && isNonEmptyFile(file),

    /** With the app stopped: drop -wal/-shm, copy the backup over the database, owned by the app's user */
    async restoreBackup(file) {
      if (!isOurBackup(file)) throw new Error('not a pre-update backup')
      if (!isNonEmptyFile(file)) throw new Error('the backup file is missing or empty')
      for (const f of sidecars) fs.rmSync(f, { force: true })
      // a fresh temp file (never a planted link), owned by the app's user, then renamed over the database
      const tmp = `${dbFile}.restoring`
      copyNew(file, tmp, { mode: 0o644, owner, fs })
      fs.renameSync(tmp, dbFile)
    },

    /**
     * With the app stopped: moves the live database (and -wal/-shm) into
     * backups/before-rollback-<local time>/ (owned by the app's user); keeps the newest 3 such folders.
     */
    async setAside() {
      realDir(backupsDir, fs)
      const dir = path.join(backupsDir, `before-rollback-${stamp(now())}`)
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { mode: 0o755 })
      if (owner) fs.lchownSync(dir, owner.uid, owner.gid)
      for (const f of [dbFile, ...sidecars]) {
        if (fs.existsSync(f)) fs.renameSync(f, path.join(dir, path.basename(f)))
      }
      // The database is already moved: a failed prune must not lose the folder the undo needs
      try {
        pruneSetAside()
      } catch (e) {
        console.warn(`updater: could not prune old before-rollback folders: ${e?.message ?? e}`)
      }
      return dir
    },

    /** Undoes setAside: whatever is live now is replaced by what was set aside */
    async putBack(dir) {
      for (const f of [dbFile, ...sidecars]) fs.rmSync(f, { force: true })
      for (const f of [dbFile, ...sidecars]) {
        const kept = path.join(dir, path.basename(f))
        if (fs.existsSync(kept)) fs.renameSync(kept, f)
      }
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}
