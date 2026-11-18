/**
 * Container-level settings from the app (ENG-121): the helper writes the install folder's
 * `.env` (mounted at /install) and applies it as `docker compose up -d` would.
 *
 * `.env` stays the source of truth, so a later `docker compose up -d` by hand keeps the change.
 * Compose itself runs in a short-lived container from the official Docker CLI image (CLI_IMAGE),
 * created through the Engine API like everything else here, with the host's install folder at
 * its own path: the app image carries no Docker CLI (size), and real compose behaves exactly like
 * the user's own runs (interpolation, profiles, override files, recreating what changed).
 *
 * Only the keys in env-file.mjs, only checked values: never a free-form key, value or command.
 * Steps: write (backup, then the new file) -> apply (compose) -> check (the app is healthy).
 * A failed apply or check puts the backup back and applies it again, then reports the error.
 */
import crypto from 'node:crypto'
import nodeFs from 'node:fs'
import path from 'node:path'
import { applyChanges, configValues, validateChanges } from './env-file.mjs'
import { readPlain, writeText } from './files.mjs'

/** The official Docker CLI image, pinned; it carries the compose plugin (v2.40) */
export const CLI_IMAGE = 'docker:28.5.2-cli'
export const INSTALL_DIR = '/install'
/** Backups kept next to .env; older ones are removed */
export const KEEP_BACKUPS = 10

const STEPS = ['write', 'apply', 'check']
const BACKUP_RE = /^\.env\.bak-\d{8}-\d{6}(?:-\d+)?$/

/**
 * The shell the CLI container runs. Every value comes in through its environment (set by the
 * helper from Docker's own labels), never pasted into the script.
 *
 * `up -d` alone leaves running the services whose profile was turned off, so those are removed
 * first (by their compose labels). `up` names the services, without the helper's own: compose
 * would otherwise recreate the helper (say after an update moved :latest) in the middle of this.
 */
export const COMPOSE_SCRIPT = `set -u
c() { docker compose --project-directory "$TAZRIM_WD" "$@"; }
on=$(c config --services) || exit 1
all=$(c --profile '*' config --services) || exit 1
for s in $all; do
  [ "$s" = "$TAZRIM_SELF" ] && continue
  if ! printf '%s\\n' "$on" | grep -qx -- "$s"; then
    ids=$(docker ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --filter "label=com.docker.compose.service=$s" --filter "label=com.docker.compose.oneoff=False") || exit 1
    if [ -n "$ids" ]; then
      echo "Removing $s (its profile is off)"
      docker rm -f $ids || exit 1
    fi
  fi
done
up=$(printf '%s\\n' "$on" | grep -vx -- "$TAZRIM_SELF")
c up -d $up
`

const pad = n => String(n).padStart(2, '0')
const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

/** One line, short, for the status page */
function short(e) {
  const m = String(e?.message ?? e).replace(/\s+/g, ' ').trim()
  return m.length > 300 ? `…${m.slice(-299)}` : m
}

/** Why compose failed, as a fixed code the app words in Hebrew */
export function failureCode(output) {
  if (/port is already allocated|address already in use|ports are not available|bind for .* failed/i.test(output)) return 'PORT_BUSY'
  return 'APPLY_FAILED'
}

/**
 * Reads, backs up and writes `.env` in `dir`, keeping the file's owner and mode (the helper is
 * root; the file is the user's). A new file takes the folder's owner. Nothing here follows a link.
 */
export function createEnvFile(dir, { fs = nodeFs, now = () => new Date() } = {}) {
  const file = path.join(dir, '.env')

  function stat() {
    try {
      return fs.lstatSync(file)
    } catch {
      return null
    }
  }

  function ownerOf() {
    const st = stat() ?? fs.statSync(dir)
    return { owner: { uid: st.uid, gid: st.gid }, mode: st.isFile() ? st.mode & 0o777 : 0o644 }
  }

  /** Replaces `.env` with `text` atomically: a fresh temp file, renamed over it */
  function replace(text) {
    const { owner, mode } = ownerOf()
    const tmp = path.join(dir, `.env.tmp-${crypto.randomBytes(4).toString('hex')}`)
    writeText(tmp, text, { mode, owner, fs })
    try {
      fs.renameSync(tmp, file)
    } catch (e) {
      fs.rmSync(tmp, { force: true })
      throw e
    }
  }

  return {
    file,
    /** The text, '' when there is no .env; throws when it's something else than a plain file */
    read() {
      const st = stat()
      if (!st) return { text: '', exists: false }
      if (!st.isFile()) throw Object.assign(new Error('.env is not a plain file'), { code: 'ENV_NOT_FILE' })
      const text = readPlain(file, fs)
      if (text === null) throw Object.assign(new Error('.env could not be read'), { code: 'ENV_NOT_FILE' })
      return { text, exists: true }
    },

    /** Copies the current text to .env.bak-<time>; returns its name */
    backup(text) {
      const { owner, mode } = ownerOf()
      let name = `.env.bak-${stamp(now())}`
      for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `.env.bak-${stamp(now())}-${i}`
      writeText(path.join(dir, name), text, { mode, owner, fs })
      // Keep the newest few
      const old = fs
        .readdirSync(dir)
        .filter(n => BACKUP_RE.test(n))
        .sort()
        .slice(0, -KEEP_BACKUPS)
      for (const n of old) fs.rmSync(path.join(dir, n), { force: true })
      return name
    },

    write: replace,

    /** Puts the file back as it was: `text`, or no file at all */
    restore(text, existed) {
      if (existed) replace(text)
      else fs.rmSync(file, { force: true })
    },
  }
}

/**
 * The config port of the helper. `docker`: composeContext, runCli, findTarget, waitHealthy;
 * `lock`: the busy flag shared with the update jobs; `status`: its own store.
 */
export function createConfig({ docker, status, lock, installDir = INSTALL_DIR, fs = nodeFs, now = () => new Date(), healthTimeoutMs = 3 * 60 * 1000, cliImage = CLI_IMAGE }) {
  const env = createEnvFile(installDir, { fs, now })
  const save = job => status.save(job)

  /** Can this install apply settings? { ctx } or { reason } */
  async function context() {
    try {
      if (!fs.existsSync(installDir)) return { reason: 'NO_INSTALL_MOUNT' }
      return { ctx: await docker.composeContext(installDir) }
    } catch (e) {
      return { reason: e?.code ?? 'NO_DOCKER', detail: short(e) }
    }
  }

  async function apply(ctx) {
    const r = await docker.runCli(ctx, cliImage, COMPOSE_SCRIPT)
    if (r.exitCode !== 0) {
      const lines = r.output.trim().split('\n').filter(Boolean)
      throw Object.assign(new Error(lines.slice(-3).join(' ') || `docker compose exited with ${r.exitCode}`), { code: failureCode(r.output) })
    }
  }

  async function checkApp() {
    const t = await docker.findTarget()
    await docker.waitHealthy(t.id, healthTimeoutMs)
  }

  function setStep(job, id, state) {
    job.steps.find(s => s.id === id).state = state
    save(job)
  }

  async function run(job, ctx, before, existed, text) {
    let wrote = false
    let current = 'write'
    try {
      setStep(job, 'write', 'running')
      job.backup = existed ? env.backup(before) : null
      env.write(text)
      wrote = true
      setStep(job, 'write', 'done')
      current = 'apply'
      setStep(job, 'apply', 'running')
      await apply(ctx)
      setStep(job, 'apply', 'done')
      current = 'check'
      setStep(job, 'check', 'running')
      await checkApp()
      setStep(job, 'check', 'done')
    } catch (e) {
      job.code = e?.code === 'PORT_BUSY' ? 'PORT_BUSY' : current === 'check' ? 'NOT_HEALTHY' : current === 'write' ? 'WRITE_FAILED' : 'APPLY_FAILED'
      job.error = short(e)
      setStep(job, current, 'failed')
      if (wrote) {
        job.steps.push({ id: 'restore', state: 'running' })
        save(job)
        try {
          env.restore(before, existed)
          await apply(ctx)
          job.restored = true
          setStep(job, 'restore', 'done')
        } catch (e2) {
          job.error = `${job.error} Putting the previous settings back also failed: ${short(e2)}`
          setStep(job, 'restore', 'failed')
        }
      }
      job.state = 'failed'
      job.finishedAt = now().toISOString()
      save(job)
      return
    }
    job.state = 'done'
    job.finishedAt = now().toISOString()
    save(job)
  }

  return {
    /** GET /v1/config: { available, reason?, values, installDir } */
    async info() {
      const { ctx, reason } = await context()
      let values = configValues('')
      if (ctx) {
        try {
          values = configValues(env.read().text)
        } catch (e) {
          return { available: false, reason: e?.code ?? 'ENV_NOT_FILE', values, installDir: ctx.workingDir }
        }
      }
      return ctx ? { available: true, values, installDir: ctx.workingDir } : { available: false, reason, values, installDir: null }
    },

    /** The current or last config job, or null */
    current: () => status.get(),

    /** 202 { job, done } | 400 refused values | 409 busy | 422 not available */
    async start(changes) {
      if (lock.busy) return { status: 409, code: 'BUSY', error: 'An update, a rollback or a settings change is already running.' }
      lock.busy = true
      try {
        const { ctx, reason, detail } = await context()
        if (!ctx) {
          lock.busy = false
          return { status: 422, code: 'NOT_AVAILABLE', reason, error: detail ?? reason }
        }
        let read
        try {
          read = env.read()
        } catch (e) {
          lock.busy = false
          return { status: 422, code: 'NOT_AVAILABLE', reason: e?.code ?? 'ENV_NOT_FILE', error: short(e) }
        }
        const v = validateChanges(changes, configValues(read.text))
        if (!v.ok) {
          lock.busy = false
          return { status: 400, code: v.code, key: v.key, error: v.error }
        }
        const job = {
          id: crypto.randomBytes(8).toString('hex'),
          kind: 'config',
          state: 'running',
          restored: false,
          changes: v.changes,
          steps: STEPS.map(id => ({ id, state: 'waiting' })),
          startedAt: now().toISOString(),
        }
        save(job)
        const text = applyChanges(read.text, v.changes)
        const done = run(job, ctx, read.text, read.exists, text)
          .catch(e => console.error('updater: config job crashed', e))
          .finally(() => {
            lock.busy = false
          })
        return { status: 202, job: structuredClone(job), done }
      } catch (e) {
        lock.busy = false
        throw e
      }
    },
  }
}
