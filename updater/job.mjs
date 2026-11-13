/**
 * The update and rollback jobs (ENG-98). All sequencing lives here; Docker and the app are
 * ports passed in (docker.mjs and app.mjs in production, fakes in tests).
 *
 * Update: download -> backup -> restart -> migrate -> check. Download runs first so nothing
 * saved during a long download is lost; the backup is taken right before the stop. A failure
 * before the stop changes nothing; a failure after it puts the old container and the backup back.
 */

export const IMAGE = 'ghcr.io/jordanyefet/tazrim'
export const VERSION_RE = /^\d+\.\d+\.\d+$/
export const HEALTH_TIMEOUT_MS = 3 * 60 * 1000

const UPDATE_STEPS = ['backup', 'download', 'restart', 'migrate', 'check']
const ROLLBACK_STEPS = ['restore', 'restart', 'check']
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

export function createJobs({ docker, app, status, healthTimeoutMs = HEALTH_TIMEOUT_MS, now = () => new Date() }) {
  /** Set synchronously before the first await, so a second request can't slip in */
  let busy = false

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

  async function runUpdate(job, target) {
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
    await quietly(() => app.clearFlag())
    finish(job, 'done')
  }

  async function runRollback(job, target) {
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
    finish(job, 'done')
  }

  /** Runs `run` as the one job; `busy` is already true */
  function launch(job, run) {
    const done = run()
      .catch(e => console.error('updater: job crashed', e)) // e.g. the status file can't be written
      .finally(() => {
        busy = false
      })
    return { status: 202, job: structuredClone(job), done }
  }

  return {
    /** What /v1/health reports about the Tazrim container */
    async health() {
      const t = await docker.findTarget()
      return { updatable: Boolean(t.updatable), image: t.image, runningVersion: t.version ?? null }
    },

    /** The current or last job, or null */
    current: () => status.get(),

    /** 202 {job, done} | 400 bad or not newer | 409 a job runs | 422 not updatable */
    async startUpdate(version) {
      if (typeof version !== 'string' || !VERSION_RE.test(version)) return refuse(400, 'INVALID_VERSION', 'The version must look like 1.2.3.')
      if (busy) return refuse(409, 'BUSY', 'An update or rollback is already running.')
      busy = true
      try {
        let target
        try {
          target = await docker.findTarget()
        } catch (e) {
          busy = false
          return refuse(422, 'NOT_UPDATABLE', `Can't find the Tazrim container: ${short(e)}`)
        }
        if (!target.updatable) {
          busy = false
          return refuse(422, 'NOT_UPDATABLE', `This install doesn't run an ${IMAGE} image, so it can only be updated by hand.`)
        }
        if (target.version && !isNewer(version, target.version)) {
          busy = false
          return refuse(400, 'NOT_NEWER', `Version ${version} is not newer than the running ${target.version}.`)
        }
        const job = begin('update', target.version ?? 'unknown', version, UPDATE_STEPS)
        return launch(job, () => runUpdate(job, target))
      } catch (e) {
        busy = false
        throw e
      }
    },

    /** 202 {job, done} | 409 no finished update, its backup is gone, or a job runs */
    async startRollback() {
      if (busy) return refuse(409, 'BUSY', 'An update or rollback is already running.')
      const last = status.get()
      if (!last || last.kind !== 'update' || last.state !== 'done' || !last.backup || !last.previousImage) {
        return refuse(409, 'NO_ROLLBACK', 'There is no finished update to roll back.')
      }
      // The status file sits on the app's volume: only ever run an image that is really ours
      if (!IMAGE_ID_RE.test(last.previousImage)) return refuse(409, 'NO_ROLLBACK', 'The previous version is not a known image.')
      busy = true
      try {
        const img = await docker.inspectImage(last.previousImage).catch(() => null)
        const refs = [...(img?.RepoTags ?? []), ...(img?.RepoDigests ?? [])]
        if (!refs.some(r => repoOf(r) === IMAGE)) {
          busy = false
          return refuse(409, 'NO_ROLLBACK', `The previous version's image is gone or is not a ${IMAGE} image.`)
        }
        if (!(await app.backupExists(last.backup))) {
          busy = false
          return refuse(409, 'NO_ROLLBACK', 'The backup from before the update is gone.')
        }
        let target
        try {
          target = await docker.findTarget()
        } catch (e) {
          busy = false
          return refuse(409, 'NO_ROLLBACK', `Can't find the Tazrim container: ${short(e)}`)
        }
        const job = begin('rollback', last.to, last.from, ROLLBACK_STEPS, { backup: last.backup, previousImage: last.previousImage })
        return launch(job, () => runRollback(job, target))
      } catch (e) {
        busy = false
        throw e
      }
    },
  }
}
