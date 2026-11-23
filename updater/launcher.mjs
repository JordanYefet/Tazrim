/**
 * The updater's launcher (ENG-136): a small HTTP service on the compose network that does nothing
 * itself but start job containers. Node built-ins only; run as `node /app/updater/launcher.mjs`
 * with the Docker socket and the data volume mounted.
 *
 * Its API is frozen as api 2, so a launcher from any release keeps working with any app: all the
 * logic (update, rollback, settings, isolation, the release check) runs in the jobs, which start
 * from the APP container's own image and so always match the app's version (run.mjs).
 *
 *   GET  /v1/health        { ok, api: 2, launcherVersion }
 *   GET  /v1/jobs          { running: [{ name, id, startedAt }] }
 *   POST /v1/jobs/<name>   body: the job's input (a JSON object, up to 32 KB). Starts the job and
 *                          relays its response; a job may keep running after it answered.
 *
 * Every path needs `Authorization: Bearer <token>`, the token being the one this launcher writes
 * to <dataDir>/.updater-token for the app to read.
 *
 * Starting a job: the image, command, mounts and environment never come from the request. The
 * image is the app container's (or the launcher's own when there is none); mounts, networks, user
 * and environment are the launcher's own; no compose label is copied, so compose never mistakes
 * the job for one of its services. The input and the response go through files in <dataDir>/.jobs
 * (never the environment: a password would show in `docker inspect`).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDocker, ownContainerId } from './docker.mjs'
import { isRealDir, readPlain, realDir, writeNew, writeText } from './files.mjs'
import { dataDirFromEnv, jobsDirOf, versionFromPackage } from './runtime.mjs'

export const PORT = 8080
export const API_VERSION = 2
export const JOB_NAME_RE = /^[a-z][a-z0-9-]{0,40}$/
export const JOB_ID_RE = /^[0-9a-f]{16}$/
export const RESPONSE_WAIT_MS = 60 * 1000
const MAX_BODY = 32 * 1024
const POLL_MS = 100
const ALIVE_EVERY_MS = 1000
const SWEEP_AGE_MS = 10 * 60 * 1000
const TOKEN_RE = /^[0-9a-f]{64}$/

const enc = encodeURIComponent

/**
 * Reads the token file, or writes a new random one; always 0600 and owned by the app's user
 * (1000:1000). The folder is the app's: a symlink (or anything but a plain file) in its place is
 * removed, never followed, and mode and owner are set on the open file.
 */
export function ensureToken(dataDir, { owner = { uid: 1000, gid: 1000 } } = {}) {
  const file = path.join(dataDir, '.updater-token')
  const token = readPlain(file)?.trim() ?? ''
  if (TOKEN_RE.test(token)) {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    try {
      fs.fchmodSync(fd, 0o600)
      if (owner) fs.fchownSync(fd, owner.uid, owner.gid)
    } finally {
      fs.closeSync(fd)
    }
    return token
  }
  const fresh = crypto.randomBytes(32).toString('hex')
  writeText(file, fresh, { mode: 0o600, owner })
  return fresh
}

const sha256 = s => crypto.createHash('sha256').update(s).digest()

function send(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' })
  res.end(data)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      let v
      try {
        v = JSON.parse(text)
      } catch {
        return reject(Object.assign(new Error('the body must be JSON'), { status: 400 }))
      }
      if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(Object.assign(new Error('the body must be a JSON object'), { status: 400 }))
      resolve(v)
    })
    req.on('error', reject)
  })
}

/**
 * The create request of a job container. From the launcher's own container `self`: mounts, user,
 * environment (minus what the image brings, so the app's image keeps its own) and networks. Only
 * the two job labels (no com.docker.compose.*), no aliases (the launcher keeps its name on the
 * network), AutoRemove, and the command. `extraNetworks` are connected before start.
 */
export function jobBody({ self, selfImage, image, name, jobId }) {
  const cc = self.Config ?? {}
  const hc = self.HostConfig ?? {}
  const imageEnv = new Set(selfImage?.Config?.Env ?? [])
  const nets = Object.keys(self.NetworkSettings?.Networks ?? {})
  const mode = hc.NetworkMode ?? ''
  const shared = mode === 'host' || mode === 'none' || mode.startsWith('container:')
  const names = shared ? [] : nets
  const primary = names.includes(mode) ? mode : names[0]

  const body = {
    Image: image,
    Entrypoint: [],
    Cmd: ['node', '/app/updater/run.mjs', name, jobId],
    Env: [...(cc.Env ?? []).filter(e => !imageEnv.has(e) && !e.startsWith('TAZRIM_LAUNCHER_ID=')), `TAZRIM_LAUNCHER_ID=${self.Id}`],
    Labels: { 'tazrim.job': name, 'tazrim.job.id': jobId },
    HostConfig: {
      Binds: hc.Binds ?? undefined,
      Mounts: hc.Mounts ?? undefined,
      NetworkMode: primary ?? mode,
      AutoRemove: true,
    },
  }
  if (cc.User) body.User = cc.User
  if (primary) body.NetworkingConfig = { EndpointsConfig: { [primary]: {} } }
  return { body, extraNetworks: names.filter(n => n !== primary) }
}

/**
 * @param docker  createDocker(): inspect, inspectImage, findTarget, jobRunning, runningJobs, call
 * @param launcherId  this container's id
 */
export function createServer({
  docker,
  launcherId,
  dataDir,
  token,
  launcherVersion,
  fs: fsx = fs,
  waitMs = RESPONSE_WAIT_MS,
  pollMs = POLL_MS,
  aliveEveryMs = ALIVE_EVERY_MS,
}) {
  const jobsDir = jobsDirOf(dataDir)
  const expected = sha256(token)
  const authorized = header => {
    const m = /^Bearer (\S+)$/.exec(header ?? '')
    return Boolean(m) && crypto.timingSafeEqual(sha256(m[1]), expected)
  }

  /** The folder for the inputs and responses: a real folder owned by root, nobody else's reach (0700) */
  function ensureJobsDir() {
    const existed = isRealDir(jobsDir, fsx)
    if (!existed) fsx.rmSync(jobsDir, { recursive: true, force: true })
    realDir(jobsDir, fsx)
    fsx.chmodSync(jobsDir, 0o700)
  }

  const inFile = id => path.join(jobsDir, `${id}.in.json`)
  const outFile = id => path.join(jobsDir, `${id}.out.json`)
  const cleanFiles = id => {
    fsx.rmSync(inFile(id), { force: true })
    fsx.rmSync(outFile(id), { force: true })
  }

  /** The image for a job: the app container's, so the job's code is the app's version; the launcher's own when there is no app container (say mid-update) */
  async function jobImage(self) {
    try {
      const t = await docker.findTarget()
      if (t?.imageId) return t.imageId
    } catch {
      // no app container right now
    }
    return self.Image
  }

  async function alive(id) {
    const c = await docker.call('GET', `/containers/${enc(id)}/json`, { fine: [404] }).catch(() => null)
    return c?.State?.Running === true || c?.State?.Status === 'created'
  }

  const kill = id => docker.call('POST', `/containers/${enc(id)}/kill`, { fine: [404, 409] }).catch(() => {})

  /** The job's response { status, body } from its file, or null (not there yet, or not valid) */
  function readResponse(id) {
    const text = readPlain(outFile(id), fsx)
    if (text === null) return null
    try {
      const r = JSON.parse(text)
      return Number.isInteger(r?.status) && r.status >= 100 && r.status <= 599 ? { status: r.status, body: r.body ?? null } : null
    } catch {
      return null
    }
  }

  async function runJob(name, input) {
    const jobId = crypto.randomBytes(8).toString('hex')
    let containerId = null
    try {
      ensureJobsDir()
      writeNew(inFile(jobId), fd => fsx.writeSync(fd, JSON.stringify(input)), { mode: 0o600, fs: fsx })
      const self = await docker.inspect(launcherId)
      const selfImage = await docker.inspectImage(self.Image).catch(() => null)
      const { body, extraNetworks } = jobBody({ self, selfImage, image: await jobImage(self), name, jobId })
      containerId = (await docker.call('POST', '/containers/create', { body })).Id
      for (const n of extraNetworks) {
        await docker.call('POST', `/networks/${enc(n)}/connect`, { body: { Container: containerId, EndpointConfig: {} } })
      }
      await docker.call('POST', `/containers/${enc(containerId)}/start`)

      const deadline = Date.now() + waitMs
      let nextAlive = Date.now() + aliveEveryMs
      for (;;) {
        const r = readResponse(jobId)
        if (r) return r
        if (Date.now() >= deadline) throw new Error(`no response in ${Math.round(waitMs / 1000)} seconds`)
        if (Date.now() >= nextAlive) {
          nextAlive = Date.now() + aliveEveryMs
          // Gone without an answer (a response written just before it exited still counts)
          if (!(await alive(containerId))) {
            const last = readResponse(jobId)
            if (last) return last
            throw new Error('the job ended without a response')
          }
        }
        await new Promise(r => setTimeout(r, pollMs))
      }
    } catch (e) {
      console.error(`updater: job ${name} (${jobId}) failed: ${e?.message ?? e}`)
      if (containerId) await kill(containerId)
      return { status: 500, body: { error: 'JOB_FAILED' } }
    } finally {
      cleanFiles(jobId)
    }
  }

  return http.createServer(async (req, res) => {
    try {
      if (!authorized(req.headers.authorization)) return send(res, 401, { error: 'unauthorized' })
      const { pathname } = new URL(req.url ?? '/', 'http://updater')
      if (pathname === '/v1/health') {
        return req.method === 'GET' ? send(res, 200, { ok: true, api: API_VERSION, launcherVersion }) : send(res, 405, { error: 'method not allowed' })
      }
      if (pathname === '/v1/jobs') {
        if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
        return send(res, 200, { running: await docker.runningJobs() })
      }
      const m = /^\/v1\/jobs\/([^/]*)$/.exec(pathname)
      if (!m) return send(res, 404, { error: 'not found' })
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      if (!JOB_NAME_RE.test(m[1])) return send(res, 404, { error: 'not found' })
      const input = await readJson(req)
      const r = await runJob(m[1], input)
      send(res, r.status, r.body)
    } catch (e) {
      if (!res.headersSent) send(res, e?.status ?? 500, { error: e?.status ? e.message : 'internal error' })
      if (!e?.status) console.error('updater:', e)
    }
  })
}

/**
 * At startup: input and response files nobody collected (older than 10 minutes; the lock stays,
 * run.mjs judges it), and the job and compose containers that exited
 */
export async function sweep({ docker, dataDir, fs: fsx = fs, now = () => Date.now() }) {
  const dir = jobsDirOf(dataDir)
  try {
    for (const n of fsx.readdirSync(dir)) {
      if (n === 'lock') continue
      const f = path.join(dir, n)
      try {
        const st = fsx.lstatSync(f)
        if (st.isFile() && now() - st.mtimeMs > SWEEP_AGE_MS) fsx.rmSync(f, { force: true })
      } catch {
        // gone already
      }
    }
  } catch {
    // no folder yet
  }
  await docker.removeFinishedCli()
}

export function main() {
  const dataDir = dataDirFromEnv(process.env)
  const token = ensureToken(dataDir)
  const docker = createDocker()
  // Negotiated now so a too-old Docker shows in the log at once
  docker.api().then(
    v => console.log(`updater: Docker API ${v}`),
    e => console.warn(`updater: ${e?.message ?? e}`),
  )
  sweep({ docker, dataDir }).catch(e => console.warn(`updater: ${e?.message ?? e}`))
  const launcherVersion = versionFromPackage()
  createServer({ docker, launcherId: process.env.TAZRIM_LAUNCHER_ID || ownContainerId(), dataDir, token, launcherVersion }).listen(PORT, () => {
    console.log(`updater: launcher ${launcherVersion} listening on :${PORT} (api v${API_VERSION}), data in ${dataDir}`)
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
