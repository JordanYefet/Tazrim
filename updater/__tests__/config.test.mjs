import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLI_IMAGE, COMPOSE_SCRIPT, createConfig, failureCode, KEEP_BACKUPS } from '../config.mjs'
import { memLock, memStore } from './fakes.mjs'

const ENV = '# fake install\nTAZRIM_PORT=3000\nCOMPOSE_PROFILES=updater\nTAZRIM_TZ=Asia/Jerusalem\n'
const CTX = { project: 'tazrim-test', selfService: 'updater', workingDir: '/home/someone/tazrim', configFiles: ['/home/someone/tazrim/docker-compose.yml'], socket: '/var/run/docker.sock' }

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-config-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

/** A fake Docker: `results` are the compose exit codes in order (default 0); every run sees .env as it is then */
function fakeDocker({ results = [], output = '', context, unhealthy = false } = {}) {
  const calls = []
  const seen = []
  return {
    calls,
    seen,
    async composeContext(mount) {
      calls.push(['composeContext', mount])
      if (context instanceof Error) throw context
      return context ?? CTX
    },
    async runCli(ctx, image, script) {
      calls.push(['runCli', ctx.project, image])
      expect(script).toBe(COMPOSE_SCRIPT)
      seen.push(fs.existsSync(path.join(dir, '.env')) ? fs.readFileSync(path.join(dir, '.env'), 'utf8') : null)
      const code = results.shift() ?? 0
      return { exitCode: code, output: code ? output : 'Container tazrim-test-tazrim-1 Started' }
    },
    async findTarget() {
      calls.push(['findTarget'])
      return { id: 'app-id' }
    },
    async waitHealthy(id) {
      calls.push(['waitHealthy', id])
      if (unhealthy) throw new Error('the container is unhealthy')
    },
  }
}

function setup(opts = {}) {
  if (opts.env !== null) fs.writeFileSync(path.join(dir, '.env'), opts.env ?? ENV, { mode: 0o640 })
  const docker = fakeDocker(opts)
  const status = memStore()
  const lock = opts.lock ?? memLock()
  let t = Date.parse('2026-11-14T10:00:00Z')
  const config = createConfig({ docker, status, lock, installDir: dir, now: () => new Date((t += 1000)), healthTimeoutMs: 1000 })
  return { docker, status, lock, config }
}

const backups = () => fs.readdirSync(dir).filter(n => n.startsWith('.env.bak-')).sort()
const read = () => fs.readFileSync(path.join(dir, '.env'), 'utf8')

describe('GET info', () => {
  it('reports the values and the install folder', async () => {
    const { config } = setup()
    expect(await config.info()).toEqual({
      available: true,
      installDir: CTX.workingDir,
      values: { TAZRIM_PORT: '3000', TAZRIM_PHONE_PORT: null, COMPOSE_PROFILES: 'updater', TAZRIM_LAN_IP: null, TAZRIM_HOST: null, TAZRIM_DNS_HOST: null, TAZRIM_DNS_BIND: null },
    })
  })

  it('is unavailable without the /install mount or compose labels', async () => {
    const { config } = setup({ context: Object.assign(new Error('/install is not mounted'), { code: 'NO_INSTALL_MOUNT' }) })
    expect(await config.info()).toMatchObject({ available: false, reason: 'NO_INSTALL_MOUNT', installDir: null })
    const missing = createConfig({ docker: fakeDocker(), status: memStore(), lock: memLock(), installDir: path.join(dir, 'nope') })
    expect(await missing.info()).toMatchObject({ available: false, reason: 'NO_INSTALL_MOUNT' })
  })

  it('is unavailable when .env is a symlink', async () => {
    const { config } = setup({ env: null })
    fs.writeFileSync(path.join(dir, 'elsewhere'), 'TAZRIM_PORT=1\n')
    fs.symlinkSync(path.join(dir, 'elsewhere'), path.join(dir, '.env'))
    expect(await config.info()).toMatchObject({ available: false, reason: 'ENV_NOT_FILE' })
    expect((await config.start({ TAZRIM_PORT: '3005' })).status).toBe(422)
  })
})

describe('start', () => {
  it('backs up, writes in place keeping the rest, applies and checks the app', async () => {
    const { config, docker, status } = setup()
    const r = await config.start({ TAZRIM_PORT: '3005', TAZRIM_LAN_IP: '192.168.1.20' })
    expect(r.status).toBe(202)
    expect(r.job).toMatchObject({ kind: 'config', state: 'running', changes: { TAZRIM_PORT: '3005', TAZRIM_LAN_IP: '192.168.1.20' } })
    await r.done

    expect(read()).toBe('# fake install\nTAZRIM_PORT=3005\nCOMPOSE_PROFILES=updater\nTAZRIM_TZ=Asia/Jerusalem\nTAZRIM_LAN_IP=192.168.1.20\n')
    expect(fs.statSync(path.join(dir, '.env')).mode & 0o777).toBe(0o640)
    expect(backups()).toEqual(['.env.bak-' + status.get().backup.slice('.env.bak-'.length)])
    expect(fs.readFileSync(path.join(dir, backups()[0]), 'utf8')).toBe(ENV)
    expect(fs.readdirSync(dir).some(n => n.includes('.tmp-'))).toBe(false)
    expect(docker.seen).toEqual([read()])
    expect(docker.calls).toContainEqual(['runCli', 'tazrim-test', CLI_IMAGE])
    expect(docker.calls).toContainEqual(['waitHealthy', 'app-id'])
    const job = status.get()
    expect(job.state).toBe('done')
    expect(job.steps).toEqual([
      { id: 'write', state: 'done' },
      { id: 'apply', state: 'done' },
      { id: 'check', state: 'done' },
    ])
  })

  it('creates .env when there is none, and takes no backup', async () => {
    const { config } = setup({ env: null })
    await (await config.start({ TAZRIM_PORT: '3005' })).done
    expect(read()).toBe('TAZRIM_PORT=3005\n')
    expect(backups()).toEqual([])
  })

  it('refuses an unknown key or a bad value and leaves .env untouched', async () => {
    const { config, docker } = setup()
    expect(await config.start({ TAZRIM_TZ: 'UTC' })).toMatchObject({ status: 400, code: 'UNKNOWN_KEY', key: 'TAZRIM_TZ' })
    expect(await config.start({ TAZRIM_PORT: '3000; docker rm -f x' })).toMatchObject({ status: 400, code: 'INVALID_VALUE' })
    expect(await config.start({ TAZRIM_PORT: '3005', EVIL: '1' })).toMatchObject({ status: 400, code: 'UNKNOWN_KEY' })
    expect(await config.start({ COMPOSE_PROFILES: 'https' })).toMatchObject({ status: 400, code: 'KEEP_UPDATER' })
    expect(read()).toBe(ENV)
    expect(backups()).toEqual([])
    expect(docker.calls.map(c => c[0])).not.toContain('runCli')
  })

  it('a busy port puts the backup back, applies it again and reports PORT_BUSY', async () => {
    const { config, docker, status, lock } = setup({
      results: [1, 0],
      output: 'Error response from daemon: Bind for 127.0.0.1:3100 failed: port is already allocated\n',
    })
    await (await config.start({ TAZRIM_PORT: '3100' })).done
    expect(read()).toBe(ENV)
    expect(docker.seen).toEqual([ENV.replace('3000', '3100'), ENV])
    const job = status.get()
    expect(job).toMatchObject({ state: 'failed', code: 'PORT_BUSY', restored: true })
    expect(job.error).toMatch(/port is already allocated/)
    expect(job.steps).toEqual([
      { id: 'write', state: 'done' },
      { id: 'apply', state: 'failed' },
      { id: 'check', state: 'waiting' },
      { id: 'restore', state: 'done' },
    ])
    expect(lock.busy).toBe(false)
  })

  it('an unhealthy app after the change also rolls back', async () => {
    const { config, status, docker } = setup({ unhealthy: true })
    await (await config.start({ TAZRIM_PHONE_PORT: '3007' })).done
    expect(read()).toBe(ENV)
    expect(status.get()).toMatchObject({ state: 'failed', code: 'NOT_HEALTHY', restored: true })
    expect(docker.calls.filter(c => c[0] === 'runCli')).toHaveLength(2)
  })

  it('a .env that did not exist is removed again on failure', async () => {
    const { config, status } = setup({ env: null, results: [1, 0], output: 'boom' })
    await (await config.start({ TAZRIM_PORT: '3005' })).done
    expect(fs.existsSync(path.join(dir, '.env'))).toBe(false)
    expect(status.get()).toMatchObject({ state: 'failed', code: 'APPLY_FAILED', restored: true })
  })

  it('says so when putting it back fails too', async () => {
    const { config, status } = setup({ results: [1, 1], output: 'no such image' })
    await (await config.start({ TAZRIM_PORT: '3005' })).done
    const job = status.get()
    expect(job).toMatchObject({ state: 'failed', restored: false })
    expect(job.error).toMatch(/also failed/)
    expect(job.steps.at(-1)).toEqual({ id: 'restore', state: 'failed' })
  })

  it('one job at a time, shared with updates', async () => {
    const lock = memLock(true)
    const { config } = setup({ lock })
    expect(await config.start({ TAZRIM_PORT: '3005' })).toMatchObject({ status: 409, code: 'BUSY' })
    lock.busy = false
    const r = await config.start({ TAZRIM_PORT: '3005' })
    expect(lock.busy).toBe(true)
    expect(await config.start({ TAZRIM_PORT: '3006' })).toMatchObject({ status: 409 })
    await r.done
    expect(lock.busy).toBe(false)
  })

  it('keeps only the newest backups', async () => {
    const { config } = setup()
    for (let i = 0; i < KEEP_BACKUPS + 3; i++) await (await config.start({ TAZRIM_PORT: String(4000 + i) })).done
    expect(backups()).toHaveLength(KEEP_BACKUPS)
    expect(read()).toContain(`TAZRIM_PORT=${4000 + KEEP_BACKUPS + 2}`)
  })
})

describe('failureCode', () => {
  it('spots a busy port in compose output', () => {
    expect(failureCode('Error response from daemon: driver failed programming external connectivity: Bind for 0.0.0.0:3100 failed: port is already allocated')).toBe('PORT_BUSY')
    expect(failureCode('listen tcp 0.0.0.0:80: bind: address already in use')).toBe('PORT_BUSY')
    expect(failureCode('pull access denied')).toBe('APPLY_FAILED')
  })
})
