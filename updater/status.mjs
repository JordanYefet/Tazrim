/**
 * The current or last job (ENG-98): a file, <dataDir>/.update-status.json (or .config-status.json),
 * so whichever process asks (a job container, the app) reads the same thing. Nothing is kept in
 * memory (ENG-136): a job runs in its own short-lived container. A job that died in the middle
 * leaves "running" behind; the app settles that on its side (lib/updates/status.ts).
 */
import nodeFs from 'node:fs'
import { readPlain, writeText } from './files.mjs'

export function createStatusStore(file, { fs = nodeFs } = {}) {
  // The folder belongs to the app's user: the temp file is created afresh (never through a planted
  // link) and the status file is only read when it's a plain file
  const write = s => {
    const tmp = `${file}.tmp`
    writeText(tmp, JSON.stringify(s, null, 2), { mode: 0o644, fs })
    fs.renameSync(tmp, file)
  }

  return {
    /** A copy of the current or last job, or null */
    get() {
      try {
        const v = JSON.parse(readPlain(file, fs) ?? 'null')
        return v && typeof v === 'object' ? v : null
      } catch {
        return null
      }
    },
    save: write,
  }
}
