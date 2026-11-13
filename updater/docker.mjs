/**
 * The Docker port for the update jobs (ENG-98): thin calls to the Docker Engine API over the
 * socket. No sequencing here (that's job.mjs); the only target is the compose service `tazrim`
 * in the helper's own compose project.
 */
import fs from 'node:fs'
import http from 'node:http'
import { repoOf } from './job.mjs'

export { repoOf }

/** The newest Engine API this helper is written against, and the oldest it accepts (Healthcheck.StartInterval needs 1.44) */
export const API_MAX = '1.47'
export const API_MIN = '1.44'
const VERSION_RE = /^v?(\d+\.\d+\.\d+)$/
const POLL_MS = 2000
/** No answer (or no new bytes) for this long fails a call */
const CALL_TIMEOUT_MS = 60 * 1000
/** A pull fails when no progress line arrives for 5 minutes, or after 30 minutes in all */
const PULL_IDLE_MS = 5 * 60 * 1000
const PULL_TOTAL_MS = 30 * 60 * 1000

const apiParts = v => String(v ?? '').split('.').map(Number)
const apiLess = (a, b) => {
  const [a1, a2] = apiParts(a)
  const [b1, b2] = apiParts(b)
  return a1 !== b1 ? a1 < b1 : a2 < b2
}

/**
 * The API version to speak, from the daemon's `GET /version`: its own version capped at
 * API_MAX, never below its minimum. `error` when that is older than API_MIN.
 */
export function negotiateApi(daemon) {
  const own = daemon?.ApiVersion
  if (!/^\d+\.\d+$/.test(own ?? '')) return { version: null, error: 'Docker did not say which API version it speaks' }
  let version = apiLess(own, API_MAX) ? own : API_MAX
  const min = daemon.MinAPIVersion
  if (/^\d+\.\d+$/.test(min ?? '') && apiLess(version, min)) version = min
  if (apiLess(version, API_MIN)) return { version, error: `Docker's API ${version} is older than ${API_MIN}; update Docker` }
  return { version, error: null }
}

const enc = encodeURIComponent
/** Image names go into the path as Docker's own client sends them: slashes and colons kept */
const encName = s => enc(s).replace(/%2F/gi, '/').replace(/%3A/gi, ':')
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The helper's own container id: from /proc/self/mountinfo (/etc/hostname is mounted from the container's folder), else HOSTNAME */
export function containerIdFrom(mountinfo, fallback) {
  return /\/containers\/([0-9a-f]{64})\//.exec(mountinfo)?.[1] ?? fallback
}

function ownContainerId() {
  let mountinfo = ''
  try {
    mountinfo = fs.readFileSync('/proc/self/mountinfo', 'utf8')
  } catch {
    // not on Linux
  }
  return containerIdFrom(mountinfo, process.env.HOSTNAME ?? '')
}

/**
 * The create request for a copy of container `c` on `image`. Whatever the old image brought
 * (env, labels, cmd, entrypoint, healthcheck, workdir, user) is left out so the new image's own
 * values apply; what the container set itself is kept. The first network goes into the create;
 * the rest are connected before start (one endpoint per create on this API version).
 */
export function createBody(c, oldImage, image) {
  const cc = c.Config ?? {}
  const ic = oldImage?.Config ?? {}
  const shortId = c.Id.slice(0, 12)
  const imageEnv = new Set(ic.Env ?? [])
  const imageLabels = ic.Labels ?? {}

  const body = {
    Image: image,
    Env: (cc.Env ?? []).filter(e => !imageEnv.has(e)),
    Labels: Object.fromEntries(Object.entries(cc.Labels ?? {}).filter(([k, v]) => imageLabels[k] !== v)),
    ExposedPorts: cc.ExposedPorts,
    HostConfig: c.HostConfig,
  }
  if (!same(cc.Cmd, ic.Cmd)) body.Cmd = cc.Cmd
  if (!same(cc.Entrypoint, ic.Entrypoint)) body.Entrypoint = cc.Entrypoint
  if (cc.Healthcheck && !same(cc.Healthcheck, ic.Healthcheck)) body.Healthcheck = cc.Healthcheck
  if (cc.User && cc.User !== (ic.User ?? '')) body.User = cc.User
  if (cc.WorkingDir && cc.WorkingDir !== (ic.WorkingDir ?? '')) body.WorkingDir = cc.WorkingDir
  if (cc.StopSignal && cc.StopSignal !== ic.StopSignal) body.StopSignal = cc.StopSignal
  if (cc.StopTimeout !== undefined) body.StopTimeout = cc.StopTimeout
  if (cc.Hostname && cc.Hostname !== shortId) body.Hostname = cc.Hostname
  if (cc.Domainname) body.Domainname = cc.Domainname
  if (cc.Tty) body.Tty = true
  if (cc.OpenStdin) body.OpenStdin = true

  const nets = c.NetworkSettings?.Networks ?? {}
  const endpoint = n => {
    const e = { Aliases: (nets[n].Aliases ?? []).filter(a => a !== shortId && a !== c.Id) }
    if (nets[n].IPAMConfig) e.IPAMConfig = nets[n].IPAMConfig
    if (nets[n].Links?.length) e.Links = nets[n].Links
    return e
  }
  const mode = c.HostConfig?.NetworkMode ?? ''
  const shared = mode === 'host' || mode === 'none' || mode.startsWith('container:')
  const names = shared ? [] : Object.keys(nets)
  const primary = names.includes(mode) ? mode : names[0]
  if (primary) body.NetworkingConfig = { EndpointsConfig: { [primary]: endpoint(primary) } }
  const extraNetworks = names.filter(n => n !== primary).map(name => ({ name, endpoint: endpoint(name) }))

  return { body, name: c.Name.replace(/^\//, ''), extraNetworks }
}

export function createDocker({
  socketPath = '/var/run/docker.sock',
  selfId = ownContainerId(),
  service = 'tazrim',
  image = 'ghcr.io/jordanyefet/tazrim',
  timeouts = {},
} = {}) {
  const callMs = timeouts.callMs ?? CALL_TIMEOUT_MS
  const pullIdleMs = timeouts.pullIdleMs ?? PULL_IDLE_MS
  const pullTotalMs = timeouts.pullTotalMs ?? PULL_TOTAL_MS

  /**
   * One request; `onLine` gets each line of a streamed (2xx) answer. Fails when no bytes arrive
   * for `idleMs`, or when the whole answer takes longer than `totalMs`.
   */
  function request(method, path, { body, onLine, idleMs = callMs, totalMs = Infinity, idleWhat = 'Docker did not answer' } = {}) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body)
      const headers = data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
      let idle = null
      let total = null
      const stop = () => {
        clearTimeout(idle)
        clearTimeout(total)
      }
      const fail = e => {
        stop()
        reject(e)
      }
      const req = http.request({ socketPath, path, method, headers }, res => {
        const streaming = onLine && res.statusCode < 300
        let text = ''
        let buf = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          armIdle()
          if (!streaming) return void (text += chunk)
          buf += chunk
          let i
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim()
            buf = buf.slice(i + 1)
            if (line) onLine(line)
          }
        })
        res.on('end', () => {
          stop()
          if (streaming && buf.trim()) onLine(buf.trim())
          resolve({ status: res.statusCode, text })
        })
        res.on('error', fail)
        res.on('aborted', () => fail(new Error('Docker closed the connection')))
      })
      const armIdle = () => {
        clearTimeout(idle)
        idle = setTimeout(() => req.destroy(new Error(`${idleWhat} for ${Math.round(idleMs / 1000)} seconds`)), idleMs)
      }
      armIdle()
      if (Number.isFinite(totalMs)) {
        total = setTimeout(() => req.destroy(new Error(`gave up after ${Math.round(totalMs / 60000)} minutes`)), totalMs)
      }
      req.on('error', fail)
      if (data) req.write(data)
      req.end()
    })
  }

  /** The API prefix, negotiated once with the daemon (a failed try is retried on the next call) */
  let api = null
  async function apiPrefix() {
    if (!api) {
      api = (async () => {
        const r = await request('GET', '/version')
        if (r.status !== 200) throw new Error(`Docker: GET /version answered ${r.status}`)
        return negotiateApi(JSON.parse(r.text))
      })()
      api.catch(() => {
        api = null
      })
    }
    const { version, error } = await api
    if (error) throw new Error(error)
    return `/v${version}`
  }

  /** Throws Docker's message on an error status (unless it's in `fine`); returns parsed JSON or null */
  async function call(method, path, { body, onLine, fine = [], ...limits } = {}) {
    const r = await request(method, (await apiPrefix()) + path, { body, onLine, ...limits })
    if (r.status >= 400 && !fine.includes(r.status)) {
      let message = r.text
      try {
        message = JSON.parse(r.text).message ?? message
      } catch {
        // not JSON
      }
      throw new Error(`Docker: ${message || `HTTP ${r.status}`}`)
    }
    if (!r.text) return null
    try {
      return JSON.parse(r.text)
    } catch {
      return null
    }
  }

  const inspect = id => call('GET', `/containers/${enc(id)}/json`)
  const inspectImage = id => call('GET', `/images/${encName(id)}/json`)

  return {
    /** The one `tazrim` service container in the helper's own compose project (not a `-previous` one) */
    async findTarget() {
      const self = await inspect(selfId)
      const project = self?.Config?.Labels?.['com.docker.compose.project']
      if (!project) throw new Error('the updater is not running under docker compose')
      const filters = JSON.stringify({ label: [`com.docker.compose.project=${project}`, `com.docker.compose.service=${service}`] })
      const list = await call('GET', `/containers/json?all=true&filters=${enc(filters)}`)
      const found = (list ?? []).filter(c => !(c.Names ?? []).some(n => n.endsWith('-previous')))
      if (found.length !== 1) throw new Error(`expected one ${service} container in project ${project}, found ${found.length}`)
      const c = await inspect(found[0].Id)
      const img = await inspectImage(c.Image).catch(() => null)
      const label = img?.Config?.Labels?.['org.opencontainers.image.version']
      const ref = c.Config?.Image ?? ''
      return {
        id: c.Id,
        name: c.Name.replace(/^\//, ''),
        image: ref,
        imageId: c.Image,
        version: VERSION_RE.exec(label ?? '')?.[1] ?? null,
        updatable: repoOf(ref) === image,
      }
    },

    /** Pulls repo:tag; onProgress({current, total}) in bytes summed over the layers */
    async pull(repo, tag, onProgress) {
      const layers = new Map()
      let failure = null
      await call('POST', `/images/create?fromImage=${enc(repo)}&tag=${enc(tag)}`, {
        idleMs: pullIdleMs,
        totalMs: pullTotalMs,
        idleWhat: 'the download made no progress',
        onLine: line => {
          let ev
          try {
            ev = JSON.parse(line)
          } catch {
            return
          }
          if (ev.error) failure = ev.error
          if (!ev.id) return
          const d = ev.progressDetail
          if (ev.status === 'Downloading' && d?.total > 0) layers.set(ev.id, { current: d.current ?? 0, total: d.total })
          else if (/^(Download complete|Pull complete|Already exists)$/.test(ev.status ?? '') && layers.has(ev.id)) {
            const l = layers.get(ev.id)
            l.current = l.total
          } else return
          let current = 0
          let total = 0
          for (const l of layers.values()) {
            current += l.current
            total += l.total
          }
          onProgress({ current, total })
        },
      })
      if (failure) throw new Error(failure)
    },

    /** The negotiated API version, e.g. "1.47"; rejects when Docker is too old or unreachable */
    api: async () => (await apiPrefix()).slice(2),

    inspect,

    inspectImage,

    stop: id => call('POST', `/containers/${enc(id)}/stop?t=30`, { fine: [304] }),

    rename: (id, name) => call('POST', `/containers/${enc(id)}/rename?name=${enc(name)}`),

    /** A new container like `inspected` (see createBody) on `image`, with every network and alias; returns its id */
    async createLike(inspected, newImage) {
      const oldImage = await inspectImage(inspected.Image).catch(() => null)
      const { body, name, extraNetworks } = createBody(inspected, oldImage, newImage)
      const created = await call('POST', `/containers/create?name=${enc(name)}`, { body })
      try {
        for (const n of extraNetworks) {
          await call('POST', `/networks/${enc(n.name)}/connect`, { body: { Container: created.Id, EndpointConfig: n.endpoint } })
        }
      } catch (e) {
        // the caller never gets this id, so don't leave the container holding the name
        await call('DELETE', `/containers/${enc(created.Id)}?force=true&v=false`).catch(() => {})
        throw e
      }
      return created.Id
    },

    start: id => call('POST', `/containers/${enc(id)}/start`, { fine: [304] }),

    /** Resolves once Docker reports the container healthy; rejects if it turns unhealthy, exits, or `ms` pass */
    async waitHealthy(id, ms) {
      const deadline = Date.now() + ms
      for (;;) {
        const c = await inspect(id)
        const s = c?.State ?? {}
        const health = s.Health?.Status
        if (!s.Running && s.Status !== 'created') throw new Error(`the container ${s.Status ?? 'stopped'} (exit code ${s.ExitCode ?? '?'})`)
        if (health === 'healthy' || (!s.Health && s.Running)) return
        if (health === 'unhealthy') throw new Error('the container is unhealthy')
        if (Date.now() >= deadline) throw new Error(`not healthy after ${Math.round(ms / 60000)} minutes`)
        await new Promise(r => setTimeout(r, POLL_MS))
      }
    },

    /** Force-removes a container; its volumes stay */
    remove: id => call('DELETE', `/containers/${enc(id)}?force=true&v=false`),

    tag: (imageId, repo, tag) => call('POST', `/images/${encName(imageId)}/tag?repo=${enc(repo)}&tag=${enc(tag)}`),
  }
}
