/**
 * The Docker port for the update jobs (ENG-98): thin calls to the Docker Engine API over the
 * socket. No sequencing here (that's job.mjs); the only target is the compose service `tazrim`
 * in the helper's own compose project.
 */
import fs from 'node:fs'
import http from 'node:http'

const API = '/v1.43'
const VERSION_RE = /^v?(\d+\.\d+\.\d+)$/
const POLL_MS = 2000

const enc = encodeURIComponent
/** Image names go into the path as Docker's own client sends them: slashes and colons kept */
const encName = s => enc(s).replace(/%2F/gi, '/').replace(/%3A/gi, ':')
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** "ghcr.io/x/y:1.2.0" or "...@sha256:..." -> "ghcr.io/x/y" (a registry port's colon is kept) */
export function repoOf(ref) {
  const noDigest = ref.split('@')[0]
  const colon = noDigest.lastIndexOf(':')
  return colon > noDigest.lastIndexOf('/') ? noDigest.slice(0, colon) : noDigest
}

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

export function createDocker({ socketPath = '/var/run/docker.sock', selfId = ownContainerId(), service = 'tazrim', image = 'ghcr.io/jordanyefet/tazrim' } = {}) {
  /** One request; `onLine` gets each line of a streamed (2xx) answer */
  function request(method, path, { body, onLine } = {}) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body)
      const headers = data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
      const req = http.request({ socketPath, path: API + path, method, headers }, res => {
        const streaming = onLine && res.statusCode < 300
        let text = ''
        let buf = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
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
          if (streaming && buf.trim()) onLine(buf.trim())
          resolve({ status: res.statusCode, text })
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      if (data) req.write(data)
      req.end()
    })
  }

  /** Throws Docker's message on an error status (unless it's in `fine`); returns parsed JSON or null */
  async function call(method, path, { body, onLine, fine = [] } = {}) {
    const r = await request(method, path, { body, onLine })
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

    inspect,

    stop: id => call('POST', `/containers/${enc(id)}/stop?t=30`, { fine: [304] }),

    rename: (id, name) => call('POST', `/containers/${enc(id)}/rename?name=${enc(name)}`),

    /** A new container like `inspected` (see createBody) on `image`, with every network and alias; returns its id */
    async createLike(inspected, newImage) {
      const oldImage = await inspectImage(inspected.Image).catch(() => null)
      const { body, name, extraNetworks } = createBody(inspected, oldImage, newImage)
      const created = await call('POST', `/containers/create?name=${enc(name)}`, { body })
      for (const n of extraNetworks) {
        await call('POST', `/networks/${enc(n.name)}/connect`, { body: { Container: created.Id, EndpointConfig: n.endpoint } })
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
