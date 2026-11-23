import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, ensureToken, jobBody, sweep } from '../launcher.mjs'

const TOKEN = 'a'.repeat(64)
const APP_IMAGE = `sha256:${'b'.repeat(64)}`
const SELF_IMAGE = `sha256:${'c'.repeat(64)}`
const SELF_ID = 'd'.repeat(64)

/** The launcher's own container, as Docker inspects it: compose labels, mounts, two networks, the proxy env */
const SELF = {
  Id: SELF_ID,
  Image: SELF_IMAGE,
  Config: {
    User: 'root',
    Env: ['PATH=/usr/bin', 'NODE_ENV=production', 'TAZRIM_DATABASE_URL=file:/data/tazrim.db', 'TZ=Asia/Jerusalem', 'HTTPS_PROXY=http://squid:3128'],
    Labels: { 'com.docker.compose.project': 'tazrim', 'com.docker.compose.service': 'updater', 'com.docker.compose.oneoff': 'False' },
  },
  HostConfig: {
    NetworkMode: 'tazrim_updater-net',
    RestartPolicy: { Name: 'unless-stopped' },
    Binds: ['/var/run/docker.sock:/var/run/docker.sock', '/home/someone/tazrim:/install'],
    Mounts: [{ Type: 'volume', Source: 'tazrim_tazrim-data', Target: '/data' }],
  },
  NetworkSettings: {
    Networks: { 'tazrim_updater-net': { Aliases: ['updater', 'dddddddddddd'], IPAMConfig: { IPv4Address: '10.0.0.5' } }, tazrim_inside: { Aliases: ['updater'] } },
  },
}

let dataDir
let server
let base
let engine

/**
 * A fake Docker: records every Engine call. When the job container starts, `onStart(jobId, input)`
 * plays the job (writes its response file, or does nothing).
 */
function fakeEngine({ app = true, onStart = () => {}, alive = true } = {}) {
  const calls = []
  const inputs = []
  const docker = {
    inspect: async id => (id === SELF_ID ? structuredClone(SELF) : null),
    inspectImage: async () => ({ Config: { Env: ['PATH=/usr/bin', 'NODE_ENV=production'] } }),
    findTarget: async () => {
      if (!app) throw new Error('expected one tazrim container, found 0')
      return { imageId: APP_IMAGE }
    },
    runningJobs: async () => [{ name: 'update', id: 'e'.repeat(16), startedAt: '2026-11-23T10:00:00.000Z' }],
    removeFinishedCli: vi.fn(async () => 0),
    async call(method, url, { body } = {}) {
      calls.push({ method, url, body })
      if (url === '/containers/create') return { Id: 'job-container' }
      if (url.endsWith('/start')) {
        const jobId = calls.find(c => c.url === '/containers/create').body.Cmd[3]
        const inFile = path.join(dataDir, '.jobs', `${jobId}.in.json`)
        inputs.push({ text: fs.readFileSync(inFile, 'utf8'), mode: fs.statSync(inFile).mode & 0o777 })
        await onStart(jobId, JSON.parse(inputs.at(-1).text))
        return null
      }
      if (method === 'GET' && url.startsWith('/containers/job-container/json')) return alive ? { State: { Running: true } } : { message: 'No such container' }
      return null
    },
  }
  return { docker, calls, inputs }
}

const respondWith = (status, body) => jobId => {
  const out = path.join(dataDir, '.jobs', `${jobId}.out.json`)
  fs.writeFileSync(out, JSON.stringify({ status, body }))
}

async function start(opts = {}, serverOpts = {}) {
  engine = fakeEngine(opts)
  server = createServer({ docker: engine.docker, launcherId: SELF_ID, dataDir, token: TOKEN, launcherVersion: '9.9.9', pollMs: 5, aliveEveryMs: 20, ...serverOpts })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-launcher-'))
})
afterEach(async () => {
  await new Promise(r => server.close(r))
  fs.rmSync(dataDir, { recursive: true, force: true })
})

const call = (p, { token = TOKEN, method = 'GET', body, raw } = {}) =>
  fetch(base + p, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })

describe('auth', () => {
  it('answers 401 without the token or with a wrong one, and starts nothing', async () => {
    await start()
    for (const [method, p] of [['GET', '/v1/health'], ['GET', '/v1/jobs'], ['POST', '/v1/jobs/update']]) {
      expect((await call(p, { method, token: null })).status, p).toBe(401)
      expect((await call(p, { method, token: 'b'.repeat(64) })).status, p).toBe(401)
      expect((await call(p, { method, token: 'short' })).status, p).toBe(401)
    }
    expect(engine.calls).toEqual([])
  })
})

describe('GET /v1/health and /v1/jobs', () => {
  it('health is api 2 with the launcher version, and nothing about features', async () => {
    await start()
    const r = await call('/v1/health')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, api: 2, launcherVersion: '9.9.9' })
  })

  it('lists the running jobs', async () => {
    await start()
    expect(await (await call('/v1/jobs')).json()).toEqual({ running: [{ name: 'update', id: 'e'.repeat(16), startedAt: '2026-11-23T10:00:00.000Z' }] })
  })

  it('knows no other routes or methods', async () => {
    await start()
    expect((await call('/health')).status).toBe(404)
    expect((await call('/v1/status')).status).toBe(404)
    expect((await call('/v1/update', { method: 'POST', body: {} })).status).toBe(404)
    expect((await call('/v1/health', { method: 'POST' })).status).toBe(405)
    expect((await call('/v1/jobs/update')).status).toBe(405)
  })
})

describe('POST /v1/jobs/<name>', () => {
  it('refuses a name that is not lowercase letters, digits and dashes, and starts nothing', async () => {
    await start()
    for (const n of ['Update', '1update', 'up_date', 'up.date', '-x', 'a'.repeat(42), '..', '%2e%2e']) {
      expect((await call(`/v1/jobs/${n}`, { method: 'POST', body: {} })).status, n).toBe(404)
    }
    expect((await call('/v1/jobs/', { method: 'POST', body: {} })).status).toBe(404)
    expect((await call('/v1/jobs/a/b', { method: 'POST', body: {} })).status).toBe(404)
    expect(engine.calls).toEqual([])
  })

  it('wants a JSON object of at most 32 KB', async () => {
    await start()
    expect((await call('/v1/jobs/update', { method: 'POST', raw: 'version=1.2.0' })).status).toBe(400)
    expect((await call('/v1/jobs/update', { method: 'POST', raw: '[1]' })).status).toBe(400)
    expect((await call('/v1/jobs/update', { method: 'POST', raw: JSON.stringify({ x: 'a'.repeat(40_000) }) }).catch(() => ({ status: 413 }))).status).toBe(413)
    expect(engine.calls).toEqual([])
  })

  it('relays the job’s status and body', async () => {
    await start({ onStart: respondWith(202, { job: { kind: 'update' } }) })
    const r = await call('/v1/jobs/update', { method: 'POST', body: { version: '1.2.0' } })
    expect(r.status).toBe(202)
    expect(await r.json()).toEqual({ job: { kind: 'update' } })
  })

  it('relays a refusal as it is', async () => {
    await start({ onStart: respondWith(409, { code: 'BUSY', error: 'busy' }) })
    const r = await call('/v1/jobs/config', { method: 'POST', body: { changes: {} } })
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ code: 'BUSY', error: 'busy' })
  })

  it('creates the job from the app container’s image, never from the request', async () => {
    await start({ onStart: respondWith(200, {}) })
    await call('/v1/jobs/egress-info', {
      method: 'POST',
      body: { Image: 'evil/image', image: 'evil/image', Cmd: ['sh'], Entrypoint: ['sh'], Env: ['X=1'], Binds: ['/:/host'], HostConfig: { Privileged: true } },
    })
    const create = engine.calls.find(c => c.url === '/containers/create')
    expect(create.body.Image).toBe(APP_IMAGE)
    expect(create.body.Entrypoint).toEqual([])
    expect(create.body.Cmd).toEqual(['node', '/app/updater/run.mjs', 'egress-info', expect.stringMatching(/^[0-9a-f]{16}$/)])
    expect(create.body.HostConfig.Privileged).toBeUndefined()
    expect(JSON.stringify(create.body)).not.toMatch(/evil|\/:\/host|X=1/)
  })

  it('copies the launcher’s mounts, user, networks and environment; adds the job labels and AutoRemove; no compose label', async () => {
    await start({ onStart: respondWith(200, {}) })
    await call('/v1/jobs/config-info', { method: 'POST', body: {} })
    const create = engine.calls.find(c => c.url === '/containers/create')
    const jobId = create.body.Cmd[3]
    expect(create.body.HostConfig).toEqual({
      Binds: SELF.HostConfig.Binds,
      Mounts: SELF.HostConfig.Mounts,
      NetworkMode: 'tazrim_updater-net',
      AutoRemove: true,
    })
    expect(create.body.User).toBe('root')
    // the image's own env is left to the app's image; the rest (proxy, TAZRIM_*, TZ) goes along
    expect(create.body.Env).toEqual(['TAZRIM_DATABASE_URL=file:/data/tazrim.db', 'TZ=Asia/Jerusalem', 'HTTPS_PROXY=http://squid:3128', `TAZRIM_LAUNCHER_ID=${SELF_ID}`])
    expect(create.body.Labels).toEqual({ 'tazrim.job': 'config-info', 'tazrim.job.id': jobId })
    expect(JSON.stringify(create.body)).not.toContain('com.docker.compose')
    // the first network in the create, the others connected before start, none with the launcher's aliases
    expect(create.body.NetworkingConfig).toEqual({ EndpointsConfig: { 'tazrim_updater-net': {} } })
    const connect = engine.calls.find(c => c.url === '/networks/tazrim_inside/connect')
    expect(connect.body).toEqual({ Container: 'job-container', EndpointConfig: {} })
    const order = engine.calls.map(c => c.url)
    expect(order.indexOf('/networks/tazrim_inside/connect')).toBeLessThan(order.indexOf('/containers/job-container/start'))
  })

  it('falls back to the launcher’s own image when there is no app container', async () => {
    await start({ app: false, onStart: respondWith(200, {}) })
    await call('/v1/jobs/health', { method: 'POST', body: {} })
    expect(engine.calls.find(c => c.url === '/containers/create').body.Image).toBe(SELF_IMAGE)
  })

  it('hands the input over in a 0600 file, never in the environment, and removes the files afterwards', async () => {
    await start({ onStart: respondWith(200, {}) })
    await call('/v1/jobs/egress-approve-finish', { method: 'POST', body: { flowId: 'f', password: 'fake password value' } })
    expect(engine.inputs).toEqual([{ text: JSON.stringify({ flowId: 'f', password: 'fake password value' }), mode: 0o600 }])
    expect(JSON.stringify(engine.calls)).not.toContain('fake password value')
    expect(fs.readdirSync(path.join(dataDir, '.jobs'))).toEqual([])
    expect(fs.statSync(path.join(dataDir, '.jobs')).mode & 0o777).toBe(0o700)
  })

  it('answers 500 JOB_FAILED when the container ends without a response', async () => {
    await start({ alive: false })
    const r = await call('/v1/jobs/update', { method: 'POST', body: { version: '1.2.0' } })
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'JOB_FAILED' })
    expect(fs.readdirSync(path.join(dataDir, '.jobs'))).toEqual([])
  })

  it('answers a response that was written just before the container went', async () => {
    await start({ alive: false, onStart: respondWith(200, { ok: true }) })
    const r = await call('/v1/jobs/latest', { method: 'POST', body: {} })
    expect(await r.json()).toEqual({ ok: true })
  })

  it('kills the container and answers 500 when there is no response in time', async () => {
    await start({}, { waitMs: 150 })
    const r = await call('/v1/jobs/latest', { method: 'POST', body: {} })
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'JOB_FAILED' })
    expect(engine.calls.some(c => c.method === 'POST' && c.url === '/containers/job-container/kill')).toBe(true)
    expect(fs.readdirSync(path.join(dataDir, '.jobs'))).toEqual([])
  })

  it('answers 500 and removes the container when it can’t even be started', async () => {
    await start({})
    const call0 = engine.docker.call
    engine.docker.call = async (method, url, o) => {
      if (url.endsWith('/start')) throw new Error('Docker: no such image')
      return call0(method, url, o)
    }
    const r = await call('/v1/jobs/latest', { method: 'POST', body: {} })
    expect(r.status).toBe(500)
    expect(fs.readdirSync(path.join(dataDir, '.jobs'))).toEqual([])
  })
})

describe('jobBody', () => {
  it('keeps a shared network mode as it is and connects nothing', () => {
    const self = { ...structuredClone(SELF), HostConfig: { NetworkMode: 'host' } }
    const { body, extraNetworks } = jobBody({ self, selfImage: null, image: APP_IMAGE, name: 'latest', jobId: '0'.repeat(16) })
    expect(body.HostConfig.NetworkMode).toBe('host')
    expect(body.NetworkingConfig).toBeUndefined()
    expect(extraNetworks).toEqual([])
  })

  it("turns off the image's healthcheck (it asks the Next server, which a job does not run)", () => {
    const { body } = jobBody({ self: structuredClone(SELF), selfImage: null, image: APP_IMAGE, name: 'latest', jobId: '0'.repeat(16) })
    expect(body.Healthcheck).toEqual({ Test: ['NONE'] })
  })
})

describe('sweep', () => {
  it('removes input and response files older than 10 minutes, keeps newer ones and the lock, and removes finished containers', async () => {
    await start()
    const dir = path.join(dataDir, '.jobs')
    fs.mkdirSync(dir)
    const old = path.join(dir, `${'1'.repeat(16)}.in.json`)
    const oldOut = path.join(dir, `${'1'.repeat(16)}.out.json`)
    const fresh = path.join(dir, `${'2'.repeat(16)}.in.json`)
    const lock = path.join(dir, 'lock')
    for (const f of [old, oldOut, fresh, lock]) fs.writeFileSync(f, '{}')
    const longAgo = new Date(Date.now() - 11 * 60 * 1000)
    for (const f of [old, oldOut, lock]) fs.utimesSync(f, longAgo, longAgo)
    await sweep({ docker: engine.docker, dataDir })
    expect(fs.readdirSync(dir).sort()).toEqual([path.basename(fresh), 'lock'].sort())
    expect(engine.docker.removeFinishedCli).toHaveBeenCalledOnce()
  })

  it('does nothing when there is no jobs folder yet', async () => {
    await start()
    await expect(sweep({ docker: engine.docker, dataDir })).resolves.toBeUndefined()
  })
})

describe('ensureToken', () => {
  let dir
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('creates a 0600 token owned by 1000:1000 once and then reuses it', async () => {
    await start()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-updater-'))
    const chown = vi.spyOn(fs, 'fchownSync').mockImplementation(() => {})
    const token = ensureToken(dir)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const file = path.join(dir, '.updater-token')
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    expect(chown).toHaveBeenCalledWith(expect.any(Number), 1000, 1000)
    expect(ensureToken(dir)).toBe(token)
  })

  it('never follows a symlink planted as the token file', async () => {
    await start()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-updater-'))
    vi.spyOn(fs, 'fchownSync').mockImplementation(() => {})
    const victim = path.join(dir, 'victim')
    fs.writeFileSync(victim, 'f'.repeat(64), { mode: 0o644 })
    const file = path.join(dir, '.updater-token')
    fs.symlinkSync(victim, file)
    const token = ensureToken(dir)
    expect(token).not.toBe('f'.repeat(64))
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toBe(token)
    expect(fs.readFileSync(victim, 'utf8')).toBe('f'.repeat(64))
    expect(fs.statSync(victim).mode & 0o777).toBe(0o644)
  })
})
