/** What the launcher and the job containers share about where they run (ENG-136). */
import fs from 'node:fs'
import path from 'node:path'

/** `file:/data/tazrim.db` -> `/data/tazrim.db` */
export function dbFileFromEnv(env = process.env) {
  const url = env.TAZRIM_DATABASE_URL ?? 'file:/data/tazrim.db'
  const file = url.startsWith('file:') ? url.slice('file:'.length).split('?')[0] : ''
  if (!path.isAbsolute(file)) throw new Error(`TAZRIM_DATABASE_URL must be an absolute file: URL, got ${url}`)
  return file
}

export const dataDirFromEnv = env => path.dirname(dbFileFromEnv(env))

/** The image's own version (package.json next to updater/) */
export function versionFromPackage() {
  try {
    return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Where the input, the response and the lock of the jobs live, under the data folder */
export const JOBS_DIR = '.jobs'
export const jobsDirOf = dataDir => path.join(dataDir, JOBS_DIR)
