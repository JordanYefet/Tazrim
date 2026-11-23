import { describe, expect, it } from 'vitest'
import { sha256, updateChange } from '../compose-files.mjs'
import { createJobs } from '../job.mjs'
import { doneUpdate, fakes, memLock, memStore } from './fakes.mjs'

const Y = 'docker-compose.yml'
const E = 'docker-compose.egress.yml'
const HY = sha256('new main file')
const HE = sha256('new egress file')

/** A fake compose port: `plan` answers what `view` says; apply/restore are logged in the shared calls */
function setup({ view = null, items = null, steps = true, approvers = false, approval = { ok: true }, planError = null, applyError = null, restoreError = null, ...opts } = {}) {
  const f = fakes(opts)
  const status = memStore(opts.last)
  const files = view ?? [
    { name: Y, action: 'replace', sha256: HY, diff: '-a\n+b' },
    { name: E, action: 'create', sha256: HE, diff: '+x' },
  ]
  const changing = files.filter(x => x.action === 'replace' || x.action === 'create').map(x => ({ name: x.name }))
  const compose = {
    async plan(version, current) {
      f.calls.push(['plan', version, current])
      if (planError) throw Object.assign(new Error(planError), { code: 'COMPOSE_FETCH_FAILED' })
      return {
        view: { version, applicable: true, files, needsApproval: changing.length > 0, approvers },
        work: { items, changing, steps: items ? true : steps, version },
      }
    },
    async apply(work, { onBackups }) {
      f.calls.push(['composeApply'])
      onBackups({ [Y]: `${Y}.bak-20261113-120000` })
      if (applyError) throw Object.assign(new Error('docker compose up failed: boom'), { code: 'COMPOSE_FAILED', restored: true, backups: { [Y]: `${Y}.bak-20261113-120000` } })
      return { files: files.map(x => ({ name: x.name, action: x.action })), backups: { [Y]: `${Y}.bak-20261113-120000` }, pin: true }
    },
    async restore(c, versions) {
      f.calls.push(['composeRestore', c, versions])
      if (restoreError) throw new Error('compose failed')
      return { changed: true }
    },
  }
  const egress = {
    hasApprovers: () => approvers,
    async verifyApproval(body, change) {
      f.calls.push(['verifyApproval', body, change])
      return approval
    },
  }
  const jobs = createJobs({ docker: f.docker, app: f.app, status, lock: memLock(), compose, egress, healthTimeoutMs: 1000 })
  return { ...f, status, jobs }
}

const confirm = { files: { [Y]: HY, [E]: HE } }
const names = calls => calls.map(c => c[0])
const stepStates = job => Object.fromEntries(job.steps.map(s => [s.id, s.state]))

describe('update-plan', () => {
  it('answers the compose plan for the version, asking about the running version', async () => {
    const { jobs, calls } = setup()
    const r = await jobs.planUpdate('1.2.0')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ version: '1.2.0', applicable: true, needsApproval: true })
    expect(calls).toContainEqual(['plan', '1.2.0', '1.0.0'])
  })

  it('refuses a bad version, says COMPOSE_FETCH_FAILED when GitHub does not answer, and is not applicable without Docker or an updatable app', async () => {
    expect((await setup().jobs.planUpdate('latest')).status).toBe(400)
    expect(await setup({ planError: 'timed out' }).jobs.planUpdate('1.2.0')).toMatchObject({ status: 502, code: 'COMPOSE_FETCH_FAILED' })
    expect((await setup({ updatable: false }).jobs.planUpdate('1.2.0')).body).toMatchObject({ applicable: false, reason: 'NOT_UPDATABLE' })
    const noCompose = createJobs({ ...setup(), lock: memLock(), status: memStore() })
    expect((await noCompose.planUpdate('1.2.0')).body).toMatchObject({ applicable: false })
  })

  it('does not take the job lock and starts nothing', async () => {
    const { jobs, calls } = setup()
    await jobs.planUpdate('1.2.0')
    expect(names(calls)).not.toContain('pull')
    expect(jobs.current()).toBeNull()
  })
})

describe('update with compose files', () => {
  it('without what was confirmed it is refused: 409 COMPOSE_NEEDS_CONFIRM, nothing runs', async () => {
    const { jobs, calls } = setup()
    expect(await jobs.startUpdate('1.2.0')).toMatchObject({ status: 409, code: 'COMPOSE_NEEDS_CONFIRM' })
    expect(await jobs.startUpdate('1.2.0', {})).toMatchObject({ status: 409, code: 'COMPOSE_NEEDS_CONFIRM' })
    expect(names(calls)).not.toContain('pull')
    // the lock was given back
    expect((await jobs.startUpdate('1.2.0', confirm)).status).toBe(202)
  })

  it('a hash that differs from what was confirmed (or other files) is 409 COMPOSE_CHANGED', async () => {
    const { jobs, calls } = setup()
    for (const files of [{ [Y]: sha256('other'), [E]: HE }, { [Y]: HY }, { [Y]: HY, [E]: HE, extra: HE }]) {
      expect(await jobs.startUpdate('1.2.0', { files })).toMatchObject({ status: 409, code: 'COMPOSE_CHANGED' })
    }
    expect(names(calls)).not.toContain('pull')
  })

  it('with approvers, the approval must be for exactly this change; its refusal goes through and nothing runs', async () => {
    const ok = setup({ approvers: true })
    expect(await ok.jobs.startUpdate('1.2.0', confirm)).toMatchObject({ status: 409, code: 'COMPOSE_NEEDS_CONFIRM' })
    const approval = { flowId: 'f1', password: 'fake password value' }
    const r = await ok.jobs.startUpdate('1.2.0', { ...confirm, approval })
    expect(r.status).toBe(202)
    await r.done
    expect(ok.calls).toContainEqual(['verifyApproval', approval, updateChange('1.2.0', { [Y]: HY, [E]: HE })])

    const bad = setup({ approvers: true, approval: { status: 403, body: { error: 'BAD_PASSWORD' } } })
    expect(await bad.jobs.startUpdate('1.2.0', { ...confirm, approval })).toMatchObject({ status: 403, code: 'BAD_PASSWORD' })
    const locked = setup({ approvers: true, approval: { status: 429, body: { error: 'LOCKED', until: '2026-11-21T10:15:00.000Z' } } })
    expect(await locked.jobs.startUpdate('1.2.0', { ...confirm, approval })).toMatchObject({ status: 429, code: 'LOCKED', until: '2026-11-21T10:15:00.000Z' })
    expect(names(bad.calls)).not.toContain('pull')
  })

  it('no approvers: the confirmed hashes are enough, no approval is asked for', async () => {
    const { jobs, calls } = setup()
    const r = await jobs.startUpdate('1.2.0', confirm)
    await r.done
    expect(names(calls)).not.toContain('verifyApproval')
  })

  it('a plan with nothing to replace or create (only edited files, or a pin) needs no confirmation', async () => {
    const view = [{ name: Y, action: 'edited', sha256: HY, diff: '-a\n+b' }, { name: E, action: 'same', sha256: HE }]
    const { jobs } = setup({ view, approvers: true })
    const r = await jobs.startUpdate('1.2.0')
    expect(r.status).toBe(202)
    await r.done
    expect(jobs.current().steps.map(s => s.id)).toContain('compose')
  })

  it('a plan with nothing to do adds no step: the update runs exactly as before', async () => {
    const { jobs, calls } = setup({ view: [{ name: Y, action: 'same', sha256: HY }], steps: false })
    const r = await jobs.startUpdate('1.2.0')
    await r.done
    expect(jobs.current().steps.map(s => s.id)).toEqual(['backup', 'download', 'restart', 'migrate', 'check'])
    expect(names(calls)).not.toContain('composeApply')
  })

  it('a fetch failure refuses the start (502) and releases the lock', async () => {
    const { jobs, calls } = setup({ planError: 'timed out' })
    expect(await jobs.startUpdate('1.2.0', confirm)).toMatchObject({ status: 502, code: 'COMPOSE_FETCH_FAILED' })
    expect(names(calls)).not.toContain('pull')
    expect((await jobs.startUpdate('1.2.0', confirm)).status).toBe(502)
  })

  it('success: a last step compose after the check, then the old container goes; the status keeps the files and backups', async () => {
    const { jobs, calls } = setup()
    const r = await jobs.startUpdate('1.2.0', confirm)
    await r.done
    const s = jobs.current()
    expect(s.state).toBe('done')
    expect(s.steps.map(x => x.id)).toEqual(['backup', 'download', 'restart', 'migrate', 'check', 'compose'])
    expect(s.steps.every(x => x.state === 'done')).toBe(true)
    expect(s.compose).toEqual({
      files: [{ name: Y, action: 'replace' }, { name: E, action: 'create' }],
      backups: { [Y]: `${Y}.bak-20261113-120000` },
      pin: true,
    })
    expect(calls.findIndex(c => c[0] === 'composeApply')).toBeGreaterThan(calls.findIndex(c => c[0] === 'waitHealthy'))
    expect(calls.findIndex(c => c[0] === 'composeApply')).toBeGreaterThan(calls.findIndex(c => c[0] === 'remove' && c[1] === 'old-id'))
    expect(names(calls).at(-1)).toBe('clearFlag')
    // the plan used the running version as the base for files with no record
    expect(calls).toContainEqual(['plan', '1.2.0', '1.0.0'])
  })

  it('a failed compose step fails the job with COMPOSE_FAILED and restored; the new app stays (no put back, no restore of the database)', async () => {
    const { jobs, calls } = setup({ applyError: true })
    const r = await jobs.startUpdate('1.2.0', confirm)
    await r.done
    const s = jobs.current()
    expect(s.state).toBe('failed')
    expect(s.code).toBe('COMPOSE_FAILED')
    expect(s.restored).toBe(true)
    expect(stepStates(s)).toMatchObject({ check: 'done', compose: 'failed' })
    expect(s.error).toMatch(/compose/i)
    expect(names(calls)).not.toContain('restoreBackup')
    expect(calls.filter(c => c[0] === 'start' && c[1] === 'old-id')).toEqual([])
    expect(names(calls)).toContain('clearFlag')
    expect(s.compose.backups).toEqual({ [Y]: `${Y}.bak-20261113-120000` })
  })

  it('a failed app update never reaches the compose step', async () => {
    const { jobs, calls } = setup({ unhealthy: true })
    const r = await jobs.startUpdate('1.2.0', confirm)
    await r.done
    expect(names(calls)).not.toContain('composeApply')
    expect(jobs.current().code).toBeUndefined()
  })
})

describe('rollback with compose files', () => {
  const withCompose = { ...doneUpdate, steps: [...doneUpdate.steps, { id: 'compose', state: 'done' }], compose: { files: [], backups: { [Y]: `${Y}.bak-20261113-120000` }, pin: true } }

  it('puts the files back after the usual steps, as a last step', async () => {
    const { jobs, calls } = setup({ last: withCompose })
    const r = await jobs.startRollback()
    await r.done
    const s = jobs.current()
    expect(s.state).toBe('done')
    expect(s.steps.map(x => x.id)).toEqual(['restore', 'restart', 'check', 'compose'])
    expect(s.steps.every(x => x.state === 'done')).toBe(true)
    expect(calls).toContainEqual(['composeRestore', withCompose.compose, { from: '1.0.0', to: '1.2.0' }])
    expect(calls.findIndex(c => c[0] === 'composeRestore')).toBeGreaterThan(calls.findIndex(c => c[0] === 'waitHealthy'))
  })

  it('without compose backups it is a rollback as before', async () => {
    for (const last of [doneUpdate, { ...doneUpdate, compose: { files: [], backups: {} } }]) {
      const { jobs, calls } = setup({ last })
      const r = await jobs.startRollback()
      await r.done
      expect(jobs.current().steps.map(x => x.id)).toEqual(['restore', 'restart', 'check'])
      expect(names(calls)).not.toContain('composeRestore')
    }
  })

  it('a failed restore of the files fails the job with COMPOSE_FAILED', async () => {
    const { jobs } = setup({ last: withCompose, restoreError: true })
    const r = await jobs.startRollback()
    await r.done
    expect(jobs.current()).toMatchObject({ state: 'failed', code: 'COMPOSE_FAILED' })
    expect(stepStates(jobs.current())).toMatchObject({ check: 'done', compose: 'failed' })
  })
})
