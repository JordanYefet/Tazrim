/**
 * One job (ENG-136): `node /app/updater/run.mjs <name> <jobId>`, started by the launcher as a
 * short-lived container from the app's image, so this code is always the app's own version.
 *
 * The input is read (and deleted) from <dataDir>/.jobs/<jobId>.in.json and the response is written
 * once to <jobId>.out.json (temp file + rename) for the launcher to relay. A job may answer early
 * and keep working (update, settings, isolation): the process exits when its work is over.
 */
import crypto from 'node:crypto'
import nodeFs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.mjs'
import { createComposeUpdate } from './compose-update.mjs'
import { createConfig } from './config.mjs'
import { createDocker, selfIdFromEnv } from './docker.mjs'
import { createEgress } from './egress.mjs'
import { readPlain, writeText } from './files.mjs'
import { createJobs, IMAGE } from './job.mjs'
import { fetchLatest } from './latest.mjs'
import { createFileLock } from './lock.mjs'
import { dataDirFromEnv, dbFileFromEnv, jobsDirOf, versionFromPackage } from './runtime.mjs'
import { createStatusStore } from './status.mjs'

const NAME_RE = /^[a-z][a-z0-9-]{0,40}$/
const JOB_ID_RE = /^[0-9a-f]{16}$/

/** A start result { status, job, code, ... } answered as the API always did, then waited for */
async function started(respond, r, refusal) {
  if (r.status === 202) {
    respond(202, { job: r.job })
    await r.done
  } else respond(r.status, refusal(r))
}

const plain = r => ({ code: r.code, error: r.error, ...(r.until ? { until: r.until } : {}) })

/**
 * The fixed map from a job name to what it does. Nothing here depends on the request but its
 * input; an unknown name is answered 404. `respond(status, body)` is the one answer.
 */
export function createHandlers({ jobs, config, egress, latest, helperVersion }) {
  const pair = async (respond, result) => {
    const r = await result
    respond(r.status, r.body)
    await r.done
  }
  return {
    latest: async respond => respond(200, await latest({ helperVersion })),
    // Docker too old or out of reach: still an answer, saying why nothing can be updated
    health: async respond => {
      try {
        respond(200, await jobs.health())
      } catch (e) {
        respond(200, { updatable: false, image: '', runningVersion: null, error: String(e?.message ?? e) })
      }
    },
    'update-plan': async (respond, input) => {
      const r = await jobs.planUpdate(input?.version)
      respond(r.status, r.status === 200 ? r.body : plain(r))
    },
    update: async (respond, input) => started(respond, await jobs.startUpdate(input?.version, input?.compose), plain),
    rollback: async respond => started(respond, await jobs.startRollback(), plain),
    'config-info': async respond => respond(200, await config.info()),
    config: async (respond, input) => started(respond, await config.start(input?.changes), r => ({ code: r.code, key: r.key, reason: r.reason, error: r.error })),
    'egress-info': respond => pair(respond, egress.info()),
    'egress-on': respond => pair(respond, egress.turnOn()),
    'egress-providers': (respond, input) => pair(respond, egress.setProviders(input)),
    'egress-register-begin': (respond, input) => pair(respond, egress.registerBegin(input)),
    'egress-register-finish': (respond, input) => pair(respond, egress.registerFinish(input)),
    'egress-approve-begin': (respond, input) => pair(respond, egress.approveBegin(input)),
    'egress-approve-finish': (respond, input) => pair(respond, egress.approveFinish(input)),
  }
}

/** The real ports for a job container: Docker, the app, the files and the one-job-at-a-time lock */
export function buildHandlers({ jobId, name, env = process.env, fs = nodeFs }) {
  const dbFile = dbFileFromEnv(env)
  const dataDir = path.dirname(dbFile)
  const token = readPlain(path.join(dataDir, '.updater-token'), fs)?.trim() ?? ''
  const docker = createDocker({ image: IMAGE })
  const lock = createFileLock({ dir: jobsDirOf(dataDir), jobId, name, isRunning: id => docker.jobRunning(id), fs })
  const app = createApp({ url: env.TAZRIM_APP_URL || 'http://tazrim:3000', token, dbFile })
  const status = createStatusStore(path.join(dataDir, '.update-status.json'))
  const config = createConfig({ docker, lock, status: createStatusStore(path.join(dataDir, '.config-status.json')) })
  const egress = createEgress({ config, docker, lock })
  const compose = createComposeUpdate({ config, docker, egress, helperVersion: versionFromPackage() })
  const jobs = createJobs({ docker, app, status, lock, compose, egress })
  return createHandlers({ jobs, config, egress, latest: fetchLatest, helperVersion: versionFromPackage() })
}

/**
 * Runs the job: reads and deletes its input, dispatches, answers once. Resolves when its work is
 * over. Without `handlers` (tests pass fakes) the real ones are built, but only for a known name,
 * so an unknown one never touches Docker.
 */
export async function runJob({ name, jobId, dataDir, handlers = null, fs = nodeFs }) {
  const dir = jobsDirOf(dataDir)
  const out = path.join(dir, `${jobId}.out.json`)
  let answered = false
  const respond = (status, body) => {
    if (answered) return
    answered = true
    const tmp = `${out}.tmp`
    writeText(tmp, JSON.stringify({ status, body }), { mode: 0o600, fs })
    fs.renameSync(tmp, out)
  }
  try {
    if (!NAME_RE.test(name) || !JOB_ID_RE.test(jobId)) throw new Error('bad job name or id')
    const inFile = path.join(dir, `${jobId}.in.json`)
    let input = {}
    try {
      input = JSON.parse(readPlain(inFile, fs) ?? '{}')
    } catch {
      // a broken input is an empty one: the job refuses what it needs
    }
    fs.rmSync(inFile, { force: true })
    if (!(handlers ? Object.hasOwn(handlers, name) : KNOWN.includes(name))) return respond(404, { error: 'UNKNOWN_JOB' })
    const handler = (handlers ?? buildHandlers({ name, jobId }))[name]
    await handler(respond, input && typeof input === 'object' ? input : {})
    // A job that finished without answering (a bug) must not leave the launcher waiting
    respond(500, { error: 'JOB_FAILED' })
  } catch (e) {
    console.error(`updater: job ${name} failed:`, e)
    try {
      respond(500, { error: 'JOB_FAILED' })
    } catch {
      // the answer can't even be written: the launcher gives up when this process ends
    }
  }
}

/** The names the fixed map answers to (kept next to createHandlers) */
export const KNOWN = ['latest', 'health', 'update-plan', 'update', 'rollback', 'config-info', 'config', 'egress-info', 'egress-on', 'egress-providers', 'egress-register-begin', 'egress-register-finish', 'egress-approve-begin', 'egress-approve-finish']

async function main() {
  const [name, jobId] = process.argv.slice(2)
  await runJob({ name, jobId, dataDir: dataDirFromEnv(process.env) })
  // Timers or sockets left open by Docker calls must not keep a finished job alive
  process.exit(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main()
