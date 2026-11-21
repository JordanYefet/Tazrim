import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLI_IMAGE, COMPOSE_SCRIPT_ISOLATION, createConfig, EGRESS_FILE, RECREATE_SCRIPT } from '../config.mjs'
import { memStore } from './fakes.mjs'

const WD = '/home/someone/tazrim'
const ctxWith = files => ({ project: 'tazrim-test', selfService: 'updater', workingDir: WD, configFiles: files.map(n => (n.startsWith('/') ? n : `${WD}/${n}`)), socket: '/var/run/docker.sock' })
const ENV = '# fake install\nTAZRIM_PORT=3000\nCOMPOSE_PROFILES=updater\n'

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-egress-switch-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

function setup({ files = ['docker-compose.yml'], results = [], unhealthy = false, detachFails = false, env = ENV } = {}) {
  fs.writeFileSync(path.join(dir, '.env'), env)
  const calls = []
  const docker = {
    async composeContext() {
      return ctxWith(files)
    },
    async runCli(ctx, image, script) {
      calls.push({ op: 'runCli', files: ctx.configFiles, image, script, env: fs.readFileSync(path.join(dir, '.env'), 'utf8') })
      const code = results.shift() ?? 0
      return { exitCode: code, output: code ? 'boom' : 'ok' }
    },
    async runCliDetached(ctx, image, script) {
      calls.push({ op: 'detached', files: ctx.configFiles, image, script, saved: status.get() })
      if (detachFails) throw new Error('Docker: cannot start')
      return 'cli-id'
    },
    async findTarget() {
      return { id: 'app-id' }
    },
    async waitHealthy() {
      calls.push({ op: 'waitHealthy' })
      if (unhealthy) throw new Error('the container is unhealthy')
    },
  }
  const status = memStore()
  const config = createConfig({ docker, status, lock: { busy: false }, installDir: dir, healthTimeoutMs: 1000 })
  return { config, status, calls }
}
const read = () => fs.readFileSync(path.join(dir, '.env'), 'utf8')

describe('startEgress: turning isolation on', () => {
  it('adds the override file to COMPOSE_FILE, applies with the NEW list, checks, then recreates the helper', async () => {
    let prepared = 0
    const { config, status, calls } = setup()
    const r = await config.startEgress(true, { prepare: () => void prepared++ })
    expect(r.status).toBe(202)
    await r.done
    expect(prepared).toBe(1)
    expect(read()).toBe(`${ENV}COMPOSE_FILE=docker-compose.yml:${EGRESS_FILE}\nCOMPOSE_PATH_SEPARATOR=:\n`)
    const run = calls.find(c => c.op === 'runCli')
    expect(run.files).toEqual([`${WD}/docker-compose.yml`, `${WD}/${EGRESS_FILE}`])
    expect(run.script).toBe(COMPOSE_SCRIPT_ISOLATION)
    expect(run.script).toContain('--remove-orphans')
    expect(run.env).toContain(`COMPOSE_FILE=docker-compose.yml:${EGRESS_FILE}`)
    expect(status.get()).toMatchObject({ kind: 'config', egress: 'on', state: 'done', restartingHelper: true })
  })

  it('starts the detached self-recreate only after the app is healthy, and the job already reads done by then', async () => {
    const { config, calls } = setup()
    await (await config.startEgress(true)).done
    expect(calls.map(c => c.op)).toEqual(['runCli', 'waitHealthy', 'detached'])
    const d = calls.at(-1)
    expect(d.script).toBe(RECREATE_SCRIPT)
    expect(d.script).toMatch(/up -d --no-deps --force-recreate "\$TAZRIM_SELF"/)
    expect(d.image).toBe(CLI_IMAGE)
    expect(d.files).toEqual([`${WD}/docker-compose.yml`, `${WD}/${EGRESS_FILE}`])
    expect(d.saved).toMatchObject({ state: 'done', restartingHelper: true })
  })

  it('keeps the other compose files the user has', async () => {
    const { config, calls } = setup({ files: ['docker-compose.yml', 'docker-compose.mine.yml'], env: 'COMPOSE_FILE=docker-compose.yml:docker-compose.mine.yml\n' })
    await (await config.startEgress(true)).done
    expect(read()).toBe(`COMPOSE_FILE=docker-compose.yml:docker-compose.mine.yml:${EGRESS_FILE}\nCOMPOSE_PATH_SEPARATOR=:\n`)
    expect(calls.find(c => c.op === 'runCli').files).toEqual([`${WD}/docker-compose.yml`, `${WD}/docker-compose.mine.yml`, `${WD}/${EGRESS_FILE}`])
  })

  it('a failed health check rolls .env back, applies the old list again and never recreates the helper', async () => {
    const { config, status, calls } = setup({ unhealthy: true })
    await (await config.startEgress(true)).done
    expect(read()).toBe(ENV)
    expect(status.get()).toMatchObject({ state: 'failed', code: 'NOT_HEALTHY', restored: true })
    expect(status.get().restartingHelper).toBeUndefined()
    expect(calls.map(c => c.op)).toEqual(['runCli', 'waitHealthy', 'runCli'])
    // the restore applies the files that were in use before
    expect(calls[2].files).toEqual([`${WD}/docker-compose.yml`])
  })

  it('a failed apply rolls back too, with no recreate', async () => {
    const { config, status, calls } = setup({ results: [1, 0] })
    await (await config.startEgress(true)).done
    expect(read()).toBe(ENV)
    expect(status.get()).toMatchObject({ state: 'failed', code: 'APPLY_FAILED', restored: true })
    expect(calls.some(c => c.op === 'detached')).toBe(false)
  })

  it('a failed prepare stops before .env is written', async () => {
    const { config, status } = setup()
    await (
      await config.startEgress(true, {
        prepare: () => {
          throw new Error('no override file')
        },
      })
    ).done
    expect(read()).toBe(ENV)
    expect(status.get()).toMatchObject({ state: 'failed', code: 'WRITE_FAILED' })
  })

  it('if the recreate cannot be started the job stays done and says so', async () => {
    const { config, status } = setup({ detachFails: true })
    await (await config.startEgress(true)).done
    expect(status.get()).toMatchObject({ state: 'done', restartingHelper: false })
    expect(status.get().helperRestartError).toMatch(/cannot start/)
  })

  it('refuses when it is already on', async () => {
    const { config } = setup({ files: ['docker-compose.yml', EGRESS_FILE] })
    expect(await config.startEgress(true)).toMatchObject({ status: 409, code: 'ALREADY_ON' })
  })
})

describe('startEgress: turning isolation off', () => {
  it('takes the override file out of COMPOSE_FILE, keeping the rest, and applies without it', async () => {
    const { config, calls, status } = setup({
      files: ['docker-compose.yml', 'docker-compose.mine.yml', EGRESS_FILE],
      env: `COMPOSE_FILE=docker-compose.yml:docker-compose.mine.yml:${EGRESS_FILE}\nCOMPOSE_PATH_SEPARATOR=:\n`,
    })
    await (await config.startEgress(false)).done
    expect(read()).toBe('COMPOSE_FILE=docker-compose.yml:docker-compose.mine.yml\nCOMPOSE_PATH_SEPARATOR=:\n')
    expect(calls.find(c => c.op === 'runCli').files).toEqual([`${WD}/docker-compose.yml`, `${WD}/docker-compose.mine.yml`])
    expect(calls.at(-1).op).toBe('detached')
    expect(status.get()).toMatchObject({ egress: 'off', state: 'done', restartingHelper: true })
  })

  it('a failed check puts the file list back (isolation stays on)', async () => {
    const before = `COMPOSE_FILE=docker-compose.yml:${EGRESS_FILE}\nCOMPOSE_PATH_SEPARATOR=:\n`
    const { config, calls } = setup({ files: ['docker-compose.yml', EGRESS_FILE], env: before, unhealthy: true })
    await (await config.startEgress(false)).done
    expect(read()).toBe(before)
    expect(calls.at(-1).files).toEqual([`${WD}/docker-compose.yml`, `${WD}/${EGRESS_FILE}`])
    expect(calls.some(c => c.op === 'detached')).toBe(false)
  })

  it('refuses when it is already off, and while another job runs', async () => {
    const { config } = setup()
    expect(await config.startEgress(false)).toMatchObject({ status: 409, code: 'ALREADY_OFF' })
    const busy = createConfig({ docker: {}, status: memStore(), lock: { busy: true }, installDir: dir })
    expect(await busy.startEgress(true)).toMatchObject({ status: 409, code: 'BUSY' })
  })
})
