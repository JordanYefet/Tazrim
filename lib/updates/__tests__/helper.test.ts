import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { helperConfigJob, helperHealth, helperIsReady, helperJob, helperRunningJobs, helperTarget, HELPER_API, resetHelperCache, runJob } from '../helper'
import { currentJob, settle } from '../status'

let dir: string
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

/** Stubs fetch by URL path and remembers each call */
function launcher(routes: Record<string, () => Promise<Response>>) {
  const calls: { path: string; method?: string; body?: unknown; headers: Record<string, string> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const p = new URL(url).pathname
      calls.push({ path: p, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers ?? {}) as Record<string, string> })
      return routes[p] ? routes[p]() : Promise.reject(new Error('unreachable'))
    })
  )
  return calls
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-helper-'))
  vi.stubEnv('TAZRIM_DATABASE_URL', `file:${path.join(dir, 'x.db')}`)
  fs.writeFileSync(path.join(dir, '.updater-token'), 'e'.repeat(64))
  resetHelperCache()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('runJob', () => {
  it('POSTs the input to /v1/jobs/<name> with the token and returns { status, json }', async () => {
    const calls = launcher({ '/v1/jobs/config': () => json({ job: { id: 'j' } }, 202) })
    const r = await runJob('config', { changes: { TAZRIM_PORT: '3005' } })
    expect(r).toEqual({ status: 202, json: { job: { id: 'j' } } })
    expect(calls[0]).toMatchObject({ path: '/v1/jobs/config', method: 'POST', body: { changes: { TAZRIM_PORT: '3005' } } })
    expect(calls[0].headers.Authorization).toBe(`Bearer ${'e'.repeat(64)}`)
  })

  it('waits longer than the launcher does (70 s by default)', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout')
    launcher({ '/v1/jobs/latest': () => json({}) })
    await runJob('latest')
    await runJob('latest', {}, { timeoutMs: 1234 })
    expect(spy.mock.calls.map(c => c[0])).toEqual([70_000, 1234])
  })

  it('is null without a token and when the launcher is down', async () => {
    launcher({})
    expect(await runJob('latest')).toBeNull()
    fs.rmSync(path.join(dir, '.updater-token'))
    expect(await runJob('latest')).toBeNull()
  })
})

describe('the launcher’s health', () => {
  it('api 2 is ready', async () => {
    launcher({ '/v1/health': () => json({ ok: true, api: 2, launcherVersion: '1.30.0' }) })
    const h = await helperHealth()
    expect(HELPER_API).toBe(2)
    expect(h).toEqual({ ok: true, api: 2, launcherVersion: '1.30.0' })
    expect(helperIsReady(h)).toBe(true)
  })

  it('api 1 (an updater from before) comes back, and is old', async () => {
    launcher({ '/v1/health': () => json({ ok: true, api: 1, helperVersion: '1.19.0', features: ['config'], updatable: true, image: 'x', runningVersion: '1.0.0' }) })
    const h = await helperHealth()
    expect(h).toEqual({ ok: true, api: 1, launcherVersion: '1.19.0' })
    expect(helperIsReady(h)).toBe(false)
  })

  it('is null when it is unreachable or answers something else', async () => {
    launcher({ '/v1/health': () => json({ nope: true }) })
    expect(await helperHealth()).toBeNull()
    expect(helperIsReady(null)).toBe(false)
  })

  it('is cached for a minute', async () => {
    const calls = launcher({ '/v1/health': () => json({ ok: true, api: 2, launcherVersion: '1' }) })
    await helperHealth()
    await helperHealth()
    expect(calls).toHaveLength(1)
  })
})

describe('helperTarget', () => {
  it('is what the health job says, cached', async () => {
    const calls = launcher({ '/v1/jobs/health': () => json({ updatable: true, image: 'ghcr.io/example/tazrim:1.0.0', runningVersion: '1.0.0' }) })
    expect(await helperTarget()).toEqual({ updatable: true, image: 'ghcr.io/example/tazrim:1.0.0', runningVersion: '1.0.0' })
    await helperTarget()
    expect(calls).toHaveLength(1)
  })

  it('carries the reason when Docker is out of reach', async () => {
    launcher({ '/v1/jobs/health': () => json({ updatable: false, image: '', runningVersion: null, error: 'older than 1.44' }) })
    expect(await helperTarget()).toMatchObject({ updatable: false, error: 'older than 1.44' })
  })
})

describe('the jobs that run, and the status files', () => {
  it('helperRunningJobs lists the names, null when the launcher does not answer', async () => {
    launcher({ '/v1/jobs': () => json({ running: [{ name: 'update', id: 'a'.repeat(16), startedAt: 'x' }, { name: 'config' }] }) })
    expect(await helperRunningJobs()).toEqual(['update', 'config'])
    launcher({})
    expect(await helperRunningJobs()).toBeNull()
  })

  const RUNNING = { kind: 'update', from: '1.0.0', to: '1.2.0', state: 'running', restored: false, steps: [{ id: 'backup', state: 'done' }, { id: 'download', state: 'running' }] }

  it('helperJob settles a running job that has no container, and keeps one that has', async () => {
    fs.writeFileSync(path.join(dir, '.update-status.json'), JSON.stringify(RUNNING))
    launcher({ '/v1/jobs': () => json({ running: [] }) })
    const dead = await helperJob()
    expect(dead.live).toBe(true)
    expect(dead.job).toMatchObject({ state: 'failed', steps: [{ state: 'done' }, { state: 'failed' }], error: expect.any(String), finishedAt: expect.any(String) })
    launcher({ '/v1/jobs': () => json({ running: [{ name: 'rollback' }] }) })
    expect((await helperJob()).job?.state).toBe('running')
  })

  it('helperJob(true) never asks the launcher', async () => {
    fs.writeFileSync(path.join(dir, '.update-status.json'), JSON.stringify(RUNNING))
    const calls = launcher({})
    expect(await helperJob(true)).toMatchObject({ live: false, job: { state: 'running' } })
    expect(calls).toHaveLength(0)
  })

  it('the settings job counts the isolation jobs too', async () => {
    fs.writeFileSync(path.join(dir, '.config-status.json'), JSON.stringify({ id: 'j', kind: 'config', egress: 'on', state: 'running', steps: [{ id: 'apply', state: 'running' }] }))
    launcher({ '/v1/jobs': () => json({ running: [{ name: 'egress-on' }] }) })
    expect(await helperConfigJob()).toMatchObject({ state: 'running' })
    launcher({ '/v1/jobs': () => json({ running: [{ name: 'update' }] }) })
    expect(await helperConfigJob()).toMatchObject({ state: 'failed' })
  })
})

describe('settle', () => {
  it('leaves finished jobs, null and other shapes alone', () => {
    const done = { state: 'done', steps: [] }
    expect(settle(done)).toBe(done)
    expect(settle(null)).toBeNull()
  })

  it('keeps an error the job already had', () => {
    expect(settle({ state: 'running', error: 'Backup failed: x', steps: [] })).toMatchObject({ state: 'failed', error: 'Backup failed: x' })
  })

  it('a status file that is not a job (no steps) reads as none', () => {
    fs.writeFileSync(path.join(dir, '.update-status.json'), JSON.stringify({ state: 'running' }))
    expect(currentJob('.update-status.json', ['update'], [])).toEqual({ job: null, live: true })
  })
})
