/**
 * The update brings the install folder's compose files along (ENG-137). Three parts:
 *   plan     what would change, for the person to see first (read-only, a sync job)
 *   apply    the update's last step: back up, write, record, `docker compose up -d`, check
 *   restore  puts the files (and the pinned version) back: after a failed step and for a roll back
 *
 * The decision per file is in compose-files.mjs. Every write here keeps the file's owner and mode,
 * is atomic (temp file renamed over it), and never follows a symlink; a managed name that is not a
 * plain file is left alone. `.env` is only ever touched for a pinned TAZRIM_VERSION (x.y.z).
 */
import crypto from 'node:crypto'
import nodeFs from 'node:fs'
import path from 'node:path'
import { applyChanges, parseEnv } from './env-file.mjs'
import { CLI_IMAGE, COMPOSE_SCRIPT_RELEASE, createEnvFile, INSTALL_DIR, runCompose } from './config.mjs'
import { decide, fetchReleaseFile, MANAGED, parseRecord, RECORD_FILE, renderRecord, sha256, unifiedDiff } from './compose-files.mjs'
import { readPlain, writeText } from './files.mjs'
import { VERSION_RE } from './job.mjs'

/** Backups kept next to each file; older ones are removed */
export const KEEP_FILE_BACKUPS = 5
const BACKUP_RE = /^(docker-compose(?:\.egress)?\.yml|\.tazrim-managed\.json)\.bak-\d{8}-\d{6}(?:-\d+)?$/
const PIN_KEY = 'TAZRIM_VERSION'

const pad = n => String(n).padStart(2, '0')
const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

/** A fixed-code failure of the compose step */
const composeFailed = (detail, cause) => Object.assign(new Error(detail), { code: 'COMPOSE_FAILED', cause })

export function createComposeUpdate({
  config,
  docker,
  egress = null,
  installDir = INSTALL_DIR,
  fs = nodeFs,
  now = () => new Date(),
  fetchImpl = fetch,
  helperVersion = '0.0.0',
  cliImage = CLI_IMAGE,
  healthTimeoutMs = 3 * 60 * 1000,
}) {
  const env = createEnvFile(installDir, { fs, now })
  const at = name => path.join(installDir, name)

  const kind = p => {
    try {
      const st = fs.lstatSync(p)
      return st.isFile() ? 'file' : 'other'
    } catch {
      return null
    }
  }

  function owner() {
    const st = fs.statSync(installDir)
    return { uid: st.uid, gid: st.gid }
  }

  /** Replaces `name` atomically, keeping an existing file's owner and mode (a new one takes the folder's owner, 0644) */
  function replace(name, text) {
    const file = at(name)
    let o = owner()
    let mode = 0o644
    try {
      const st = fs.lstatSync(file)
      if (st.isFile()) {
        o = { uid: st.uid, gid: st.gid }
        mode = st.mode & 0o777
      }
    } catch {
      // a new file
    }
    const tmp = at(`${name}.tmp-${crypto.randomBytes(4).toString('hex')}`)
    writeText(tmp, text, { mode, owner: o, fs })
    try {
      fs.renameSync(tmp, file)
    } catch (e) {
      fs.rmSync(tmp, { force: true })
      throw e
    }
  }

  /** Copies `text` to <name>.bak-<time> (owned like the folder), keeps the newest few; returns the backup's name */
  function backUp(name, text) {
    let backup = `${name}.bak-${stamp(now())}`
    for (let i = 2; kind(at(backup)); i++) backup = `${name}.bak-${stamp(now())}-${i}`
    writeText(at(backup), text, { mode: 0o644, owner: owner(), fs })
    const old = fs
      .readdirSync(installDir)
      .filter(n => n.startsWith(`${name}.bak-`) && BACKUP_RE.test(n))
      .sort()
      .slice(0, -KEEP_FILE_BACKUPS)
    for (const n of old) fs.rmSync(at(n), { force: true })
    return backup
  }

  const readRecord = () => parseRecord(readPlain(at(RECORD_FILE), fs))

  async function fetchOrNull(version, name) {
    try {
      const r = await fetchReleaseFile({ version, name, fetchImpl, helperVersion })
      return r.none ? null : r.text
    } catch {
      return null
    }
  }

  const notApplicable = (version, reason) => ({ view: { version, applicable: false, reason, files: [], needsApproval: false, approvers: false, step: false }, work: null })

  /**
   * What an update to `version` would do to the compose files. `current`: the running version
   * (x.y.z or null). Throws COMPOSE_FETCH_FAILED when the release's files can't be fetched.
   * { view, work }: `view` is what the app gets; `work` is what `apply` needs (null when not applicable)
   */
  async function plan(version, current) {
    const { ctx, reason } = await config.context()
    if (!ctx) return notApplicable(version, reason)
    let envText
    try {
      envText = env.read().text
    } catch (e) {
      return notApplicable(version, e?.code ?? 'ENV_NOT_FILE')
    }
    const pinned = parseEnv(envText)[PIN_KEY] || null
    if (pinned && !VERSION_RE.test(pinned)) return notApplicable(version, 'CUSTOM_TAG')

    const record = readRecord()
    const items = []
    for (const name of MANAGED) {
      const next = await fetchReleaseFile({ version, name, fetchImpl, helperVersion }).then(r => (r.none ? null : r.text))
      const where = kind(at(name))
      if (where === 'other') {
        // A link or folder is the person's own doing: never followed, never replaced
        items.push({ name, action: 'skip', local: null, next })
        continue
      }
      const local = where ? readPlain(at(name), fs) : null
      let base = null
      // The file at the current tag only matters when nothing was recorded for it
      if (next !== null && local !== null && local !== next && record[name] === undefined && current && VERSION_RE.test(current)) base = await fetchOrNull(current, name)
      items.push({ name, action: decide({ name, local, next, recorded: record[name], base }), local, next })
    }

    const files = items.map(i => {
      const out = { name: i.name, action: i.action }
      if (i.next !== null) out.sha256 = sha256(i.next)
      if (i.action === 'replace' || i.action === 'create' || i.action === 'edited') {
        const d = unifiedDiff(i.local ?? '', i.next)
        out.diff = d.diff
        if (d.truncated) out.truncated = true
      }
      return out
    })
    const changing = items.filter(i => i.action === 'replace' || i.action === 'create')
    const toWrite = items.filter(i => i.action === 'edited' && readPlain(at(`${i.name}.new`), fs) !== i.next)
    const pinBump = Boolean(pinned) && pinned !== version
    // The update gets its last step (the page shows its row from the start)
    const step = changing.length > 0 || toWrite.length > 0 || pinBump
    return {
      view: { version, applicable: true, files, needsApproval: changing.length > 0, approvers: Boolean(egress?.hasApprovers()), step },
      work: { ctx, version, items, changing, toWrite, pinBump, pinned, record, steps: step },
    }
  }

  async function checkApp(ctx) {
    const t = await docker.findTarget({ project: ctx.project })
    await docker.waitHealthy(t.id, healthTimeoutMs)
  }

  async function up(ctx) {
    try {
      await runCompose(docker, ctx, cliImage, COMPOSE_SCRIPT_RELEASE)
    } catch (e) {
      throw composeFailed(`docker compose up failed: ${String(e?.message ?? e)}`, e)
    }
    await checkApp(ctx)
  }

  /**
   * The update's last step. Resolves { files: [{ name, action }], backups: { name: backupName }, pin }.
   * `onBackups(partial)` is told what was backed up before the writes start (the status file keeps it).
   * On a failure everything is put back and compose is run again; the error has code
   * COMPOSE_FAILED and `restored` (true when the files and the record are back as they were).
   */
  async function apply(work, { onBackups = () => {} } = {}) {
    const { ctx, version, items, changing, toWrite, pinBump } = work
    const backups = {}
    const touched = []
    const envBefore = env.read()
    let wroteEnv = false
    let ran = false
    const recordBefore = readPlain(at(RECORD_FILE), fs)
    try {
      for (const i of changing) {
        if (i.local !== null) backups[i.name] = backUp(i.name, i.local)
      }
      backups[RECORD_FILE] = backUp(RECORD_FILE, recordBefore ?? renderRecord({}))
      onBackups({ ...backups })
      if (pinBump && envBefore.exists) env.backup(envBefore.text)

      for (const i of changing) {
        replace(i.name, i.next)
        touched.push(i.name)
      }
      const record = { ...work.record }
      for (const i of items) if (i.action === 'replace' || i.action === 'create' || i.action === 'same') record[i.name] = sha256(i.next)
      replace(RECORD_FILE, renderRecord(record))
      for (const i of toWrite) writeText(at(`${i.name}.new`), i.next, { mode: 0o644, owner: owner(), fs })
      if (pinBump) {
        env.write(applyChanges(envBefore.text, { [PIN_KEY]: version }))
        wroteEnv = true
      }
      ran = true
      await up(ctx)
    } catch (e) {
      let restored = false
      try {
        for (const name of touched) {
          const original = items.find(i => i.name === name).local
          if (original === null) fs.rmSync(at(name), { force: true })
          else replace(name, original)
        }
        if (recordBefore === null) fs.rmSync(at(RECORD_FILE), { force: true })
        else replace(RECORD_FILE, recordBefore)
        for (const i of toWrite) fs.rmSync(at(`${i.name}.new`), { force: true })
        if (wroteEnv) env.restore(envBefore.text, envBefore.exists)
        if (ran) await up(ctx)
        restored = true
      } catch {
        // restored stays false: the files may be back, but compose does not run them
      }
      throw Object.assign(composeFailed(String(e?.message ?? e), e), { restored, backups })
    }
    return {
      files: items.filter(i => i.action === 'replace' || i.action === 'create' || i.action === 'same' || i.action === 'edited').map(i => ({ name: i.name, action: i.action })),
      backups,
      pin: pinBump,
    }
  }

  /**
   * A roll back puts the files back: `compose` is what the update's status file kept
   * ({ backups, pin }); its names are checked here, the status file is the app's to write.
   * `from`/`to` are the versions of the update being undone.
   */
  async function restore(compose, { from, to }) {
    const { ctx, reason } = await config.context()
    if (!ctx) throw composeFailed(`the install folder is not available (${reason})`)
    const backups = compose?.backups && typeof compose.backups === 'object' ? compose.backups : {}
    let changed = false
    for (const [name, backup] of Object.entries(backups)) {
      if (![...MANAGED, RECORD_FILE].includes(name) || typeof backup !== 'string' || !BACKUP_RE.test(backup) || !backup.startsWith(`${name}.bak-`)) continue
      const text = readPlain(at(backup), fs)
      if (text === null) continue
      replace(name, text)
      changed = true
    }
    if (compose?.pin && VERSION_RE.test(from) && VERSION_RE.test(to)) {
      const { text, exists } = env.read()
      // Only when it still says what the update put there
      if (exists && parseEnv(text)[PIN_KEY] === to) {
        env.backup(text)
        env.write(applyChanges(text, { [PIN_KEY]: from }))
        changed = true
      }
    }
    if (!changed) return { changed: false }
    await up(ctx)
    return { changed: true }
  }

  return { plan, apply, restore }
}
