import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createJobs, IMAGE } from '../job.mjs'
import { createStatusStore } from '../status.mjs'
import { BACKUP, doneUpdate, fakes, memStore } from './fakes.mjs'

const names = calls => calls.map(c => c[0])
const indexOf = (calls, ...call) => calls.findIndex(c => JSON.stringify(c) === JSON.stringify(call))
const stepStates = job => Object.fromEntries(job.steps.map(s => [s.id, s.state]))

function setup(opts) {
  const f = fakes(opts)
  const status = memStore(opts?.last)
  const jobs = createJobs({ docker: f.docker, app: f.app, status, healthTimeoutMs: 1000 })
  return { ...f, status, jobs }
}

describe('update', () => {
  it('runs every step: download, backup, restart, migrate, check', async () => {
    const { jobs, calls } = setup()
    const r = await jobs.startUpdate('1.2.0')
    expect(r.status).toBe(202)
    expect(r.job).toMatchObject({ kind: 'update', from: '1.0.0', to: '1.2.0', state: 'running' })
    await r.done

    const s = jobs.current()
    expect(s.state).toBe('done')
    expect(s.restored).toBe(false)
    expect(s.steps.map(x => x.id)).toEqual(['backup', 'download', 'restart', 'migrate', 'check'])
    expect(s.steps.every(x => x.state === 'done')).toBe(true)
    expect(s.backup).toBe(BACKUP)
    expect(s.previousImage).toBe('sha256:old')
    expect(s.downloaded).toEqual({ current: 100, total: 100 })
    expect(s.finishedAt).toEqual(expect.any(String))
    expect(s.error).toBeUndefined()

    expect(calls).toContainEqual(['pull', IMAGE, '1.2.0'])
    expect(indexOf(calls, 'pull', IMAGE, '1.2.0')).toBeLessThan(indexOf(calls, 'requestBackup', '1.0.0', '1.2.0'))
    expect(indexOf(calls, 'stop', 'old-id')).toBeGreaterThan(indexOf(calls, 'requestBackup', '1.0.0', '1.2.0'))
    expect(indexOf(calls, 'stop', 'old-id')).toBeLessThan(indexOf(calls, 'createLike', 'old-id', `${IMAGE}:1.2.0`))
    expect(indexOf(calls, 'rename', 'old-id', 'tazrim-tazrim-1-previous')).toBeLessThan(
      indexOf(calls, 'createLike', 'old-id', `${IMAGE}:1.2.0`),
    )
    expect(calls).toContainEqual(['start', 'new-id'])
    expect(calls).toContainEqual(['tag', `${IMAGE}:1.2.0`, IMAGE, 'latest'])
    expect(calls).toContainEqual(['waitHealthy', 'new-id', 1000])
    expect(calls).toContainEqual(['remove', 'old-id'])
    expect(calls).toContainEqual(['clearFlag'])
    expect(names(calls)).not.toContain('restoreBackup')
  })

  it('a failed download fails the job at download and never stops the app', async () => {
    const { jobs, calls } = setup({ pullFails: true })
    const r = await jobs.startUpdate('1.2.0')
    await r.done
    const s = jobs.current()
    expect(s.state).toBe('failed')
    expect(s.restored).toBe(false)
    expect(stepStates(s)).toMatchObject({ download: 'failed', backup: 'waiting', restart: 'waiting' })
    expect(s.error).toMatch(/download/i)
    expect(names(calls)).not.toContain('stop')
    expect(names(calls)).not.toContain('requestBackup')
  })

  it('a running sync fails the job at backup, clears the flag and never stops the app', async () => {
    const { jobs, calls } = setup({ syncRunning: true })
    const r = await jobs.startUpdate('1.2.0')
    await r.done
    const s = jobs.current()
    expect(s.state).toBe('failed')
    expect(stepStates(s)).toMatchObject({ download: 'done', backup: 'failed', restart: 'waiting' })
    expect(s.error).toMatch(/sync is running/i)
    expect(names(calls)).not.toContain('stop')
    expect(names(calls)).toContain('clearFlag')
  })

  it('an unhealthy new version is undone: backup restored, old container renamed back and started', async () => {
    const { jobs, calls } = setup({ unhealthy: true })
    const r = await jobs.startUpdate('1.2.0')
    await r.done
    const s = jobs.current()
    expect(s.state).toBe('failed')
    expect(s.restored).toBe(true)
    expect(s.error).toEqual(expect.any(String))
    expect(stepStates(s)).toMatchObject({ backup: 'done', download: 'done', restart: 'done', migrate: 'failed', restore: 'done' })

    const removed = indexOf(calls, 'remove', 'new-id')
    const restored = indexOf(calls, 'restoreBackup', BACKUP)
    const renamedBack = indexOf(calls, 'rename', 'old-id', 'tazrim-tazrim-1')
    const started = calls.findLastIndex(c => c[0] === 'start' && c[1] === 'old-id')
    expect(removed).toBeGreaterThan(-1)
    expect(restored).toBeGreaterThan(removed)
    expect(renamedBack).toBeGreaterThan(removed)
    expect(started).toBeGreaterThan(restored)
    expect(started).toBeGreaterThan(renamedBack)
    expect(calls).toContainEqual(['tag', 'sha256:old', IMAGE, 'latest'])
    expect(names(calls)).toContain('clearFlag')
    expect(indexOf(calls, 'remove', 'old-id')).toBe(-1)
  })

  it('refuses a second job while one runs', async () => {
    let release
    const { jobs } = setup({ pullGate: new Promise(r => (release = r)) })
    const first = await jobs.startUpdate('1.2.0')
    expect(first.status).toBe(202)
    expect((await jobs.startUpdate('1.2.0')).status).toBe(409)
    expect((await jobs.startRollback()).status).toBe(409)
    release()
    await first.done
  })

  it('refuses versions that are malformed or not newer', async () => {
    const { jobs, calls } = setup()
    expect((await jobs.startUpdate('1.2.0; rm -rf /')).status).toBe(400)
    expect((await jobs.startUpdate('v1.2.0')).status).toBe(400)
    expect((await jobs.startUpdate(12)).status).toBe(400)
    expect((await jobs.startUpdate('1.0.0')).status).toBe(400)
    expect((await jobs.startUpdate('0.9.9')).status).toBe(400)
    expect(names(calls)).not.toContain('pull')
  })

  it('refuses when the running image is not ghcr.io/jordanyefet/tazrim', async () => {
    const { jobs, calls } = setup({ updatable: false })
    expect((await jobs.startUpdate('1.2.0')).status).toBe(422)
    expect(names(calls)).not.toContain('pull')
  })

  it('allows any valid version when the running version is unknown', async () => {
    const { jobs } = setup({ version: null })
    const r = await jobs.startUpdate('0.0.1')
    expect(r.status).toBe(202)
    await r.done
    expect(jobs.current().state).toBe('done')
  })
})

describe('rollback', () => {
  it('is refused without a successful last update', async () => {
    expect((await setup().jobs.startRollback()).status).toBe(409)
    expect((await setup({ last: { ...doneUpdate, state: 'failed' } }).jobs.startRollback()).status).toBe(409)
    expect((await setup({ last: { ...doneUpdate, kind: 'rollback' } }).jobs.startRollback()).status).toBe(409)
  })

  it('is refused when the backup is gone', async () => {
    expect((await setup({ last: doneUpdate, backupMissing: true }).jobs.startRollback()).status).toBe(409)
  })

  it('restores the backup and restarts on the previous image', async () => {
    const { jobs, calls } = setup({ last: doneUpdate })
    const r = await jobs.startRollback()
    expect(r.status).toBe(202)
    expect(r.job).toMatchObject({ kind: 'rollback', from: '1.2.0', to: '1.0.0' })
    await r.done
    const s = jobs.current()
    expect(s.state).toBe('done')
    expect(s.steps.map(x => x.id)).toEqual(['restore', 'restart', 'check'])
    expect(s.steps.every(x => x.state === 'done')).toBe(true)

    expect(indexOf(calls, 'stop', 'old-id')).toBeLessThan(indexOf(calls, 'restoreBackup', BACKUP))
    expect(calls).toContainEqual(['tag', 'sha256:old', IMAGE, '1.0.0'])
    expect(calls).toContainEqual(['tag', 'sha256:old', IMAGE, 'latest'])
    expect(indexOf(calls, 'restoreBackup', BACKUP)).toBeLessThan(indexOf(calls, 'createLike', 'old-id', `${IMAGE}:1.0.0`))
    expect(calls).toContainEqual(['start', 'new-id'])
    expect(calls).toContainEqual(['waitHealthy', 'new-id', 1000])
    expect(calls).toContainEqual(['remove', 'old-id'])
  })

  it('puts the current version and its data back when the old version will not start', async () => {
    const { jobs, calls } = setup({ last: doneUpdate, unhealthy: true })
    const r = await jobs.startRollback()
    await r.done
    const s = jobs.current()
    expect(s.state).toBe('failed')
    expect(s.restored).toBe(true)
    expect(calls).toContainEqual(['putBack', '/data/backups/before-rollback-20261113-120500'])
    expect(indexOf(calls, 'rename', 'old-id', 'tazrim-tazrim-1')).toBeGreaterThan(-1)
    expect(calls.findLastIndex(c => c[0] === 'start' && c[1] === 'old-id')).toBeGreaterThan(
      indexOf(calls, 'putBack', '/data/backups/before-rollback-20261113-120500'),
    )
  })
})

describe('status file', () => {
  let dir
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }))

  it('is written after every step change', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-updater-'))
    const file = path.join(dir, '.update-status.json')
    const store = createStatusStore(file)
    const onDisk = []
    const save = store.save
    store.save = s => {
      save(s)
      onDisk.push(JSON.parse(fs.readFileSync(file, 'utf8')))
    }
    const f = fakes()
    const jobs = createJobs({ docker: f.docker, app: f.app, status: store, healthTimeoutMs: 1000 })
    await (await jobs.startUpdate('1.2.0')).done

    const seen = []
    for (const s of onDisk) {
      const key = s.steps.map(x => x.state[0]).join('')
      if (seen.at(-1) !== key) seen.push(key)
    }
    // order on the page: backup, download, restart, migrate, check
    expect(seen).toEqual(['wwwww', 'wrwww', 'wdwww', 'rdwww', 'ddwww', 'ddrww', 'dddww', 'dddrw', 'ddddw', 'ddddr', 'ddddd'])
    expect(onDisk.at(-1).state).toBe('done')
    expect(createStatusStore(file).get()).toEqual(jobs.current())
  })

  it('a job left running by a restarted helper reads as failed', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-updater-'))
    const file = path.join(dir, '.update-status.json')
    const running = { ...doneUpdate, state: 'running', steps: [{ id: 'backup', state: 'done' }, { id: 'download', state: 'running' }] }
    fs.writeFileSync(file, JSON.stringify(running))
    const s = createStatusStore(file).get()
    expect(s.state).toBe('failed')
    expect(s.steps[1].state).toBe('failed')
    expect(s.error).toEqual(expect.any(String))
  })
})
