/**
 * File work for a root helper inside a folder the app's user owns (ENG-98). That user could
 * plant a symlink where the helper is about to write (or chown), so nothing here follows one:
 * new files are opened O_CREAT|O_EXCL|O_NOFOLLOW, reads O_NOFOLLOW, and owners are set on the
 * open file descriptor.
 */
import nodeFs from 'node:fs'

const { O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = nodeFs.constants
const CHUNK = 1024 * 1024

function lstat(fs, p) {
  try {
    return fs.lstatSync(p)
  } catch {
    return null
  }
}

/** A regular file, not a symlink */
export const isRealFile = (p, fs = nodeFs) => Boolean(lstat(fs, p)?.isFile())

/** A directory, not a symlink */
export const isRealDir = (p, fs = nodeFs) => Boolean(lstat(fs, p)?.isDirectory())

/** Throws unless `dir` is a real directory; creates it (one level) when missing */
export function realDir(dir, fs = nodeFs) {
  const st = lstat(fs, dir)
  if (!st) fs.mkdirSync(dir, { mode: 0o755 })
  else if (!st.isDirectory()) throw new Error(`${dir} is not a plain folder`)
}

/** Reads a regular file without following a symlink; null when missing or not a plain file */
export function readPlain(file, fs = nodeFs) {
  let fd
  try {
    fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW)
  } catch {
    return null
  }
  try {
    return fs.fstatSync(fd).isFile() ? fs.readFileSync(fd, 'utf8') : null
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Creates `file` afresh (whatever was there, link or file, is removed first, never followed),
 * fills it via `fill(fd)`, sets mode and owner on the descriptor.
 */
export function writeNew(file, fill, { mode = 0o644, owner = null, fs = nodeFs } = {}) {
  fs.rmSync(file, { force: true })
  const fd = fs.openSync(file, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode)
  try {
    fill(fd)
    fs.fchmodSync(fd, mode)
    if (owner) fs.fchownSync(fd, owner.uid, owner.gid)
  } catch (e) {
    fs.closeSync(fd)
    fs.rmSync(file, { force: true })
    throw e
  }
  fs.closeSync(fd)
}

/** writeNew with text */
export const writeText = (file, text, opts) => writeNew(file, fd => (opts?.fs ?? nodeFs).writeSync(fd, text), opts)

/** writeNew with a copy of `src`, which must be a regular file (not a symlink) */
export function copyNew(src, file, opts = {}) {
  const fs = opts.fs ?? nodeFs
  const from = fs.openSync(src, O_RDONLY | O_NOFOLLOW)
  try {
    if (!fs.fstatSync(from).isFile()) throw new Error(`${src} is not a plain file`)
    writeNew(
      file,
      to => {
        const buf = Buffer.alloc(CHUNK)
        let n
        while ((n = fs.readSync(from, buf, 0, CHUNK, null)) > 0) fs.writeSync(to, buf, 0, n)
      },
      opts,
    )
  } finally {
    fs.closeSync(from)
  }
}
