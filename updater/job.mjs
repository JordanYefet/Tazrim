/**
 * The update and rollback jobs (ENG-98). All sequencing lives here; Docker and the app are
 * ports passed in (docker.mjs and app.mjs in production, fakes in tests).
 *
 * Update: download -> backup -> restart -> migrate -> check. Download runs first so nothing
 * saved during a long download is lost; the backup is taken right before the stop. A failure
 * before the stop changes nothing; a failure after it puts the old container and the backup back.
 * When the release brings new compose files (ENG-137, compose-update.mjs), a last step `compose`
 * writes them and runs `docker compose up -d`: the app update stays whatever happens there.
 */
import { updateChange } from './compose-files.mjs'

export const IMAGE = 'ghcr.io/jordanyefet/tazrim'
export const VERSION_RE = /^\d+\.\d+\.\d+$/
export const HEALTH_TIMEOUT_MS = 3 * 60 * 1000

const UPDATE_STEPS = ['backup', 'download', 'restart', 'migrate', 'check']
const ROLLBACK_STEPS = ['restore', 'restart', 'check']
/** The step that follows when compose files are involved */
const COMPOSE_STEP = 'compose'
/** Download progress is kept in memory on every event but written to the status file at most this often */
const PROGRESS_SAVE_MS = 1000

const IMAGE_ID_RE = /^sha256:[0-9a-f]{64}$/

/** "ghcr.io/x/y:1.2.0" or "...@sha256:..." -> "ghcr.io/x/y" (a registry port's colon is kept) */
export function repoOf(ref) {
  const noDigest = ref.split('@')[0]
  const colon = noDigest.lastIndexOf(':')
  return colon > noDigest.lastIndexOf('/') ? noDigest.slice(0, colon) : noDigest
}

/** Is x.y.z `candidate` higher than x.y.z `current`? */
export function isNewer(candidate, current) {
  const a = candidate.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/** One line, short, for the status page */
function short(e) {
  const m = String(e?.message ?? e)
    .replace(/\s+/g, ' ')
    .trim()
  return m.length > 200 ? `${m.slice(0, 199)}…` : m
}

async function quietly(fn) {
  try {
    await fn()
  } catch {
    // best effort: the job's outcome doesn't depend on it
  }
}

/** A refusal: HTTP status, a fixed machine code the app maps to its own words, and English detail */
const refuse = (status, code, error) => ({ status, code, error })

export function createJobs({ docker, app, status, lock, compose = null, egress = null, healthTimeoutMs = HEALTH_TIMEOUT_MS, now = () => new Date() }) {
  // `lock` (lock.mjs) is shared with the settings jobs (config.mjs): one job at a time, whatever its kind.

  const save = job => status.save(job)

  function begin(kind, from, to, stepIds, extra = {}) {
    const job = { kind, from, to, state: 'running', restored: false, steps: stepIds.map(id => ({ id, state: 'waiting' })), ...extra }
    save(job)
    return job
  }

  function setStep(job, id, state) {
    job.steps.find(s => s.id === id).state = state
    save(job)
  }

  /** Runs one step: running -> done, or failed with a short error (and rethrows) */
  async function step(job, id, what, fn) {
    setStep(job, id, 'running')
    try {
      const value = await fn()
      setStep(job, id, 'done')
      return value
    } catch (e) {
      job.error = e?.code === 'SYNC_RUNNING' ? short(e) : `${what}: ${short(e)}`
      setStep(job, id, 'failed')
      throw e
    }
  }

  function finish(job, state) {
    job.state = state
    job.finishedAt = now().toISOString()
    save(job)
  }

  function progress(job) {
    let lastSave = 0
    return ({ current, total }) => {
      job.downloaded = { current, total }
      const t = now().getTime()
      if (t - lastSave >= PROGRESS_SAVE_MS) {
        lastSave = t
        save(job)
      }
    }
  }

  /**
   * Puts the container that was running before the job back: gets the new one out of the way,
   * puts the database back (`restoreDb`), renames the old one back, points :latest at its image,
   * starts it. Each step tries to keep going: a half-done undo leaves the app down.
   */
  async function putBack(job, { target, newId, renamed, retagged, restoreDb, showStep }) {
    if (showStep) {
      job.steps.push({ id: 'restore', state: 'running' })
      save(job)
    }
    try {
      if (newId) {
        await quietly(() => docker.stop(newId))
        try {
          await docker.remove(newId)
        } catch {
          // can't remove it now: at least free the name for the old container
          await docker.rename(newId, `${target.name}-failed-${now().getTime()}`)
        }
      }
      // The old container is under -previous, so whatever holds its name is left over from this job
      if (renamed) await quietly(() => docker.remove(target.name))
      // Never write the database under a running app (e.g. the stop itself failed)
      const oldRunning = (await docker.inspect(target.id))?.State?.Running === true
      if (!oldRunning) await restoreDb()
      await quietly(() => app.clearFlag())
      if (renamed) await docker.rename(target.id, target.name)
      if (retagged) await quietly(() => docker.tag(target.imageId, IMAGE, 'latest'))
      if (!oldRunning) await docker.start(target.id)
      job.restored = true
      if (showStep) setStep(job, 'restore', 'done')
    } catch (e) {
      job.error = `${job.error ?? 'The job failed'} Putting the previous version back also failed: ${short(e)}`
      if (showStep) setStep(job, 'restore', 'failed')
    }
  }

  /** The compose step of an update: its own failure never undoes the app update (it was healthy before) */
  async function composeStep(job, work) {
    try {
      await step(job, COMPOSE_STEP, 'The compose files were not brought up to date', async () => {
        const r = await compose.apply(work, {
          onBackups: backups => {
            job.compose = { files: [], backups }
            save(job)
          },
        })
        job.compose = { files: r.files, backups: r.backups, ...(r.pin ? { pin: true } : {}) }
      })
      return true
    } catch (e) {
      job.code = 'COMPOSE_FAILED'
      job.restored = e?.restored === true
      if (e?.backups) job.compose = { files: [], backups: e.backups }
      save(job)
      return false
    }
  }

  async function runUpdate(job, target, work) {
    const ref = `${IMAGE}:${job.to}`
    let stopping = false
    let renamed = false
    let retagged = false
    let newId = null
    try {
      await step(job, 'download', 'Download failed', () => docker.pull(IMAGE, job.to, progress(job)))
      const backup = await step(job, 'backup', 'Backup failed', () => app.requestBackup(job.from, job.to))
      job.backup = backup.file
      // An image without a version label: the app knows what it runs (the old image's tag below uses it too)
      if (!VERSION_RE.test(job.from) && backup.from && VERSION_RE.test(backup.from)) job.from = backup.from
      job.previousImage = target.imageId
      await step(job, 'restart', 'Restart failed', async () => {
        const inspected = await docker.inspect(target.id)
        // Keep the old image tagged, so a routine `docker image prune` can't take the roll back away
        if (VERSION_RE.test(job.from)) await quietly(() => docker.tag(target.imageId, IMAGE, job.from))
        stopping = true
        await docker.stop(target.id)
        await docker.rename(target.id, `${target.name}-previous`)
        renamed = true
        newId = await docker.createLike(inspected, ref)
        await docker.start(newId)
        await docker.tag(ref, IMAGE, 'latest')
        retagged = true
      })
      // The new container's entrypoint runs the migrations before the server answers its healthcheck
      await step(job, 'migrate', 'The new version did not start', () => docker.waitHealthy(newId, healthTimeoutMs))
      await step(job, 'check', 'Final check failed', async () => {
        const c = await docker.inspect(newId)
        if (!c?.State?.Running) throw new Error('the new container is not running')
        const health = c.State.Health?.Status
        if (health && health !== 'healthy') throw new Error(`the new container is ${health}`)
      })
    } catch {
      if (stopping) {
        await putBack(job, { target, newId, renamed, retagged, restoreDb: () => app.restoreBackup(job.backup), showStep: true })
      } else {
        // nothing changed; the write pause may or may not have started (a stalled download never asks for it)
        await quietly(() => app.clearFlag())
      }
      finish(job, 'failed')
      return
    }
    await quietly(() => docker.remove(target.id))
    if (work?.steps && !(await composeStep(job, work))) {
      await quietly(() => app.clearFlag())
      finish(job, 'failed')
      return
    }
    await quietly(() => app.clearFlag())
    finish(job, 'done')
  }

  async function runRollback(job, target, undo) {
    const knownVersion = VERSION_RE.test(job.to)
    const ref = `${IMAGE}:${knownVersion ? job.to : 'latest'}`
    let stopping = false
    let renamed = false
    let retagged = false
    let setAside = null
    let newId = null
    try {
      let inspected
      await step(job, 'restore', 'Restoring the backup failed', async () => {
        inspected = await docker.inspect(target.id)
        stopping = true
        await docker.stop(target.id)
        await docker.rename(target.id, `${target.name}-previous`)
        renamed = true
        setAside = await app.setAside()
        await app.restoreBackup(job.backup)
      })
      await step(job, 'restart', 'Restart failed', async () => {
        if (knownVersion) await docker.tag(job.previousImage, IMAGE, job.to)
        await docker.tag(job.previousImage, IMAGE, 'latest')
        retagged = true
        newId = await docker.createLike(inspected, ref)
        await docker.start(newId)
      })
      await step(job, 'check', 'The previous version did not start', () => docker.waitHealthy(newId, healthTimeoutMs))
    } catch {
      if (stopping) {
        const restoreDb = async () => {
          if (setAside) await app.putBack(setAside)
        }
        await putBack(job, { target, newId, renamed, retagged, restoreDb, showStep: false })
      }
      finish(job, 'failed')
      return
    }
    await quietly(() => docker.remove(target.id))
    if (undo) {
      try {
        await step(job, COMPOSE_STEP, 'Putting the compose files back failed', () => compose.restore(undo.compose, undo.versions))
      } catch {
        job.code = 'COMPOSE_FAILED'
        finish(job, 'failed')
        return
      }
    }
    finish(job, 'done')
  }

  /** Runs `run` as the one job; the lock is already taken */
  function launch(job, run) {
    const done = run()
      .catch(e => console.error('updater: job crashed', e)) // e.g. the status file can't be written
      .finally(() => lock.release())
    return { status: 202, job: structuredClone(job), done }
  }

  /**
   * The compose files before an update starts: plans again (the person confirmed what they saw
   * minutes ago), and lets nothing through that is not what they confirmed and approved.
   * { work } (null: no compose step) or { refused }
   */
  async function composeGate(version, target, confirmed) {
    let p
    try {
      p = await compose.plan(version, target.version)
    } catch (e) {
      return { refused: refuse(502, e?.code ?? 'COMPOSE_FETCH_FAILED', short(e)) }
    }
    const work = p.work
    if (!work || work.changing.length === 0) return { work }
    const sent = confirmed?.files
    if (!sent || typeof sent !== 'object' || Array.isArray(sent)) return { refused: refuse(409, 'COMPOSE_NEEDS_CONFIRM', 'The compose files need to be confirmed first.') }
    const now = Object.fromEntries(work.changing.map(i => [i.name, p.view.files.find(f => f.name === i.name).sha256]))
    if (JSON.stringify(Object.entries(sent).sort()) !== JSON.stringify(Object.entries(now).sort())) {
      return { refused: refuse(409, 'COMPOSE_CHANGED', 'The compose files changed since they were shown.') }
    }
    if (egress?.hasApprovers()) {
      const approval = confirmed?.approval
      if (!approval || typeof approval !== 'object') return { refused: refuse(409, 'COMPOSE_NEEDS_CONFIRM', 'The compose files need an approval.') }
      const r = await egress.verifyApproval(approval, updateChange(version, now))
      if (r.status) return { refused: { status: r.status, code: r.body.error, error: r.body.detail ?? r.body.error, ...(r.body.until ? { until: r.body.until } : {}) } }
    }
    return { work }
  }

  return {
    /** What /v1/health reports about the Tazrim container */
    async health() {
      const t = await docker.findTarget()
      return { updatable: Boolean(t.updatable), image: t.image, runningVersion: t.version ?? null }
    },

    /** The current or last job, or null */
    current: () => status.get(),

    /**
     * What an update to `version` would do to the compose files (ENG-137), for the person to see
     * first. 200 { version, applicable, reason?, files, needsApproval, approvers, step } | 400 | 502 COMPOSE_FETCH_FAILED
     */
    async planUpdate(version) {
      if (typeof version !== 'string' || !VERSION_RE.test(version)) return refuse(400, 'INVALID_VERSION', 'The version must look like 1.2.3.')
      const none = reason => ({ status: 200, body: { version, applicable: false, reason, files: [], needsApproval: false, approvers: false, step: false } })
      if (!compose) return none('NO_INSTALL_MOUNT')
      let target
      try {
        target = await docker.findTarget()
      } catch {
        return none('NO_DOCKER')
      }
      if (!target.updatable) return none('NOT_UPDATABLE')
      try {
        return { status: 200, body: (await compose.plan(version, target.version)).view }
      } catch (e) {
        return refuse(502, e?.code ?? 'COMPOSE_FETCH_FAILED', short(e))
      }
    },

    /**
     * 202 {job, done} | 400 bad or not newer | 409 a job runs, or the compose files need a
     * confirmation (COMPOSE_NEEDS_CONFIRM) or changed since it (COMPOSE_CHANGED) | 422 not updatable
     * | an approval's own refusal | 502 COMPOSE_FETCH_FAILED
     * `confirmed`: { files: { name: sha256 }, approval?: { flowId, password } | { response } }
     */
    async startUpdate(version, confirmed = undefined) {
      if (typeof version !== 'string' || !VERSION_RE.test(version)) return refuse(400, 'INVALID_VERSION', 'The version must look like 1.2.3.')
      if (!(await lock.acquire())) return refuse(409, 'BUSY', 'An update or rollback is already running.')
      try {
        let target
        try {
          target = await docker.findTarget()
        } catch (e) {
          lock.release()
          return refuse(422, 'NOT_UPDATABLE', `Can't find the Tazrim container: ${short(e)}`)
        }
        if (!target.updatable) {
          lock.release()
          return refuse(422, 'NOT_UPDATABLE', `This install doesn't run an ${IMAGE} image, so it can only be updated by hand.`)
        }
        if (target.version && !isNewer(version, target.version)) {
          lock.release()
          return refuse(400, 'NOT_NEWER', `Version ${version} is not newer than the running ${target.version}.`)
        }
        const gate = compose ? await composeGate(version, target, confirmed) : { work: null }
        if (gate.refused) {
          lock.release()
          return gate.refused
        }
        const work = gate.work
        const steps = work?.steps ? [...UPDATE_STEPS, COMPOSE_STEP] : UPDATE_STEPS
        const job = begin('update', target.version ?? 'unknown', version, steps)
        return launch(job, () => runUpdate(job, target, work))
      } catch (e) {
        lock.release()
        throw e
      }
    },

    /** 202 {job, done} | 409 no finished update, its backup is gone, or a job runs */
    async startRollback() {
      if (!(await lock.acquire())) return refuse(409, 'BUSY', 'An update or rollback is already running.')
      try {
        const last = status.get()
        if (!last || last.kind !== 'update' || last.state !== 'done' || !last.backup || !last.previousImage) {
          lock.release()
          return refuse(409, 'NO_ROLLBACK', 'There is no finished update to roll back.')
        }
        // The status file sits on the app's volume: only ever run an image that is really ours
        if (!IMAGE_ID_RE.test(last.previousImage)) {
          lock.release()
          return refuse(409, 'NO_ROLLBACK', 'The previous version is not a known image.')
        }
        const img = await docker.inspectImage(last.previousImage).catch(() => null)
        const refs = [...(img?.RepoTags ?? []), ...(img?.RepoDigests ?? [])]
        if (!refs.some(r => repoOf(r) === IMAGE)) {
          lock.release()
          return refuse(409, 'NO_ROLLBACK', `The previous version's image is gone or is not a ${IMAGE} image.`)
        }
        if (!(await app.backupExists(last.backup))) {
          lock.release()
          return refuse(409, 'NO_ROLLBACK', 'The backup from before the update is gone.')
        }
        let target
        try {
          target = await docker.findTarget()
        } catch (e) {
          lock.release()
          return refuse(409, 'NO_ROLLBACK', `Can't find the Tazrim container: ${short(e)}`)
        }
        // The update's files, put back too (the names are checked in compose-update.mjs: this file is the app's to write)
        const undo = compose && last.compose?.backups && Object.keys(last.compose.backups).length ? { compose: last.compose, versions: { from: last.from, to: last.to } } : null
        const job = begin('rollback', last.to, last.from, undo ? [...ROLLBACK_STEPS, COMPOSE_STEP] : ROLLBACK_STEPS, { backup: last.backup, previousImage: last.previousImage })
        return launch(job, () => runRollback(job, target, undo))
      } catch (e) {
        lock.release()
        throw e
      }
    },
  }
}
