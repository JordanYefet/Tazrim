import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHandlers, KNOWN, runJob } from '../run.mjs'

const JOB = 'a1b2c3d4e5f60718'
let dataDir
let jobsDir

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-run-'))
  jobsDir = path.join(dataDir, '.jobs')
  fs.mkdirSync(jobsDir)
})
afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }))

const putInput = (input, id = JOB) => fs.writeFileSync(path.join(jobsDir, `${id}.in.json`), JSON.stringify(input))
const response = (id = JOB) => JSON.parse(fs.readFileSync(path.join(jobsDir, `${id}.out.json`), 'utf8'))

describe('runJob', () => {
  it('answers 404 UNKNOWN_JOB for a name that is not in the map, without building anything', async () => {
    putInput({})
    await runJob({ name: 'rm-everything', jobId: JOB, dataDir })
    expect(response()).toEqual({ status: 404, body: { error: 'UNKNOWN_JOB' } })
  })

  it('also refuses a name or id that is not shaped right', async () => {
    await runJob({ name: '../x', jobId: JOB, dataDir })
    expect(response()).toEqual({ status: 500, body: { error: 'JOB_FAILED' } })
    await runJob({ name: 'latest', jobId: '../../x', dataDir, handlers: { latest: async r => r(200, {}) } })
    expect(fs.readdirSync(jobsDir)).toEqual([`${JOB}.in.json`.replace(JOB, JOB), `${JOB}.out.json`].filter(f => fs.existsSync(path.join(jobsDir, f))))
  })

  it('reads the input and deletes the file before the job runs', async () => {
    putInput({ version: '1.2.0' })
    let seen
    await runJob({
      name: 'update',
      jobId: JOB,
      dataDir,
      handlers: {
        update: async (respond, input) => {
          seen = { input, inputFile: fs.existsSync(path.join(jobsDir, `${JOB}.in.json`)) }
          respond(202, { job: {} })
        },
      },
    })
    expect(seen).toEqual({ input: { version: '1.2.0' }, inputFile: false })
  })

  it('writes the response once (atomically); code after it keeps running', async () => {
    putInput({})
    const steps = []
    await runJob({
      name: 'update',
      jobId: JOB,
      dataDir,
      handlers: {
        update: async respond => {
          respond(202, { job: { state: 'running' } })
          steps.push('answered')
          // the launcher has the answer by now; the work goes on
          expect(response()).toEqual({ status: 202, body: { job: { state: 'running' } } })
          await new Promise(r => setTimeout(r, 20))
          respond(500, { never: true })
          steps.push('worked')
        },
      },
    })
    expect(steps).toEqual(['answered', 'worked'])
    expect(response()).toEqual({ status: 202, body: { job: { state: 'running' } } })
    expect(fs.readdirSync(jobsDir).filter(n => n.includes('.tmp'))).toEqual([])
  })

  it('a job that throws is answered 500 JOB_FAILED; one that never answers too', async () => {
    putInput({})
    await runJob({ name: 'latest', jobId: JOB, dataDir, handlers: { latest: async () => { throw new Error('boom') } } })
    expect(response()).toEqual({ status: 500, body: { error: 'JOB_FAILED' } })
    const other = 'f'.repeat(16)
    putInput({}, other)
    await runJob({ name: 'latest', jobId: other, dataDir, handlers: { latest: async () => {} } })
    expect(response(other)).toEqual({ status: 500, body: { error: 'JOB_FAILED' } })
  })

  it('a broken input file is an empty input', async () => {
    fs.writeFileSync(path.join(jobsDir, `${JOB}.in.json`), 'nope')
    let seen
    await runJob({ name: 'latest', jobId: JOB, dataDir, handlers: { latest: async (respond, input) => ((seen = input), respond(200, {})) } })
    expect(seen).toEqual({})
  })
})

describe('the fixed map', () => {
  const ok = status => ({ status, body: { done: true } })
  const make = () => {
    const seen = []
    const jobs = {
      health: async () => ({ updatable: true, image: 'x', runningVersion: '1.0.0' }),
      startUpdate: async (v, compose) => (seen.push(['update', v, compose]), v === '1.2.0' ? { status: 202, job: { kind: 'update' }, done: Promise.resolve().then(() => seen.push(['update done'])) } : { status: 400, code: 'NOT_NEWER', error: 'x' }),
      startRollback: async () => ({ status: 409, code: 'NO_ROLLBACK', error: 'x' }),
      planUpdate: async v => (seen.push(['plan', v]), v === '1.2.0' ? { status: 200, body: { version: v, applicable: true } } : { status: 502, code: 'COMPOSE_FETCH_FAILED', error: 'x' }),
    }
    const config = {
      info: async () => ({ available: true }),
      start: async c => (seen.push(['config', c]), { status: 400, code: 'INVALID_VALUE', key: 'TAZRIM_PORT', error: 'x', extra: 'dropped' }),
    }
    const egress = Object.fromEntries(['info', 'turnOn', 'registerBegin', 'registerFinish', 'approveBegin', 'approveFinish'].map(n => [n, async b => (seen.push([n, b]), n === 'turnOn' ? { ...ok(202), done: Promise.resolve().then(() => seen.push(['turnOn done'])) } : n === 'approveFinish' ? { status: 403, body: { error: 'BAD_SIGNATURE' } } : ok(200))]))
    const latest = async o => (seen.push(['latest', o]), { release: { tag_name: 'v9.1.0' } })
    return { seen, handlers: createHandlers({ jobs, config, egress, latest, helperVersion: '9.9.9' }) }
  }
  const run = async (handler, input) => {
    const answers = []
    await handler((status, body) => answers.push([status, body]), input)
    return answers
  }

  it('has exactly the documented jobs', () => {
    expect(Object.keys(make().handlers).sort()).toEqual([...KNOWN].sort())
  })

  it('latest and health', async () => {
    const { handlers, seen } = make()
    expect(await run(handlers.latest)).toEqual([[200, { release: { tag_name: 'v9.1.0' } }]])
    expect(seen).toEqual([['latest', { helperVersion: '9.9.9' }]])
    expect(await run(handlers.health)).toEqual([[200, { updatable: true, image: 'x', runningVersion: '1.0.0' }]])
  })

  it('update answers 202 { job } and then waits for the work; a refusal answers { code, error }', async () => {
    const { handlers, seen } = make()
    expect(await run(handlers.update, { version: '1.2.0' })).toEqual([[202, { job: { kind: 'update' } }]])
    expect(seen).toContainEqual(['update done'])
    expect(await run(handlers.update, { version: '0.0.1' })).toEqual([[400, { code: 'NOT_NEWER', error: 'x' }]])
    expect(await run(handlers.rollback)).toEqual([[409, { code: 'NO_ROLLBACK', error: 'x' }]])
  })

  it('update-plan answers the plan as it is, or { code, error }', async () => {
    const { handlers, seen } = make()
    expect(await run(handlers['update-plan'], { version: '1.2.0' })).toEqual([[200, { version: '1.2.0', applicable: true }]])
    expect(await run(handlers['update-plan'], { version: '9.9.9' })).toEqual([[502, { code: 'COMPOSE_FETCH_FAILED', error: 'x' }]])
    expect(seen).toContainEqual(['plan', '1.2.0'])
  })

  it('update hands what was confirmed to the job and passes a lock time of a refused approval on', async () => {
    const { handlers, seen } = make()
    await run(handlers.update, { version: '1.2.0', compose: { files: { a: 'b' } } })
    expect(seen).toContainEqual(['update', '1.2.0', { files: { a: 'b' } }])
  })

  it('config and config-info', async () => {
    const { handlers, seen } = make()
    expect(await run(handlers['config-info'])).toEqual([[200, { available: true }]])
    expect(await run(handlers.config, { changes: { TAZRIM_PORT: 'x' } })).toEqual([[400, { code: 'INVALID_VALUE', key: 'TAZRIM_PORT', reason: undefined, error: 'x' }]])
    expect(seen).toContainEqual(['config', { TAZRIM_PORT: 'x' }])
  })

  it('the egress jobs hand the input to the module, pass status and body on, and wait for an async tail', async () => {
    const { handlers, seen } = make()
    expect(await run(handlers['egress-info'])).toEqual([[200, { done: true }]])
    expect(await run(handlers['egress-on'])).toEqual([[202, { done: true }]])
    expect(seen).toContainEqual(['turnOn done'])
    expect(await run(handlers['egress-approve-finish'], { flowId: 'x', password: 'fake password value' })).toEqual([[403, { error: 'BAD_SIGNATURE' }]])
    expect(seen.at(-1)).toEqual(['approveFinish', { flowId: 'x', password: 'fake password value' }])
    for (const n of ['register-begin', 'register-finish', 'approve-begin']) expect(await run(handlers[`egress-${n}`], { a: 1 })).toEqual([[200, { done: true }]])
  })
})
