import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileLock } from '../lock.mjs'

let dir
let running // job ids whose container is alive

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-lock-'))
  running = new Set()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const lockFor = (jobId, name = 'update') => createFileLock({ dir, jobId, name, isRunning: async id => running.has(id) })
const file = () => path.join(dir, 'lock')

describe('the job lock', () => {
  it('takes the lock, writes who holds it, and releases it', async () => {
    const a = lockFor('a'.repeat(16))
    expect(await a.acquire()).toBe(true)
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toMatchObject({ jobId: 'a'.repeat(16), name: 'update', at: expect.any(String) })
    expect(fs.statSync(file()).mode & 0o777).toBe(0o600)
    a.release()
    expect(fs.existsSync(file())).toBe(false)
  })

  it('refuses while the job that holds it is still running (BUSY)', async () => {
    const a = lockFor('a'.repeat(16))
    const b = lockFor('b'.repeat(16), 'config')
    await a.acquire()
    running.add('a'.repeat(16))
    expect(await b.acquire()).toBe(false)
    expect(await b.isBusy()).toBe(true)
    expect(await a.isBusy()).toBe(false)
    // and b's release doesn't take a's lock away
    b.release()
    expect(fs.existsSync(file())).toBe(true)
  })

  it('takes over a lock whose job is gone', async () => {
    const a = lockFor('a'.repeat(16))
    const b = lockFor('b'.repeat(16), 'config')
    await a.acquire()
    expect(await b.isBusy()).toBe(false)
    expect(await b.acquire()).toBe(true)
    expect(JSON.parse(fs.readFileSync(file(), 'utf8')).jobId).toBe('b'.repeat(16))
  })

  it('takes over a lock file that can’t be read', async () => {
    fs.writeFileSync(file(), 'not json')
    expect(await lockFor('b'.repeat(16)).acquire()).toBe(true)
  })

  it('does not follow a link planted as the lock', async () => {
    const victim = path.join(dir, 'victim')
    fs.writeFileSync(victim, 'keep')
    fs.symlinkSync(victim, file())
    expect(await lockFor('b'.repeat(16)).acquire()).toBe(true)
    expect(fs.readFileSync(victim, 'utf8')).toBe('keep')
    expect(fs.lstatSync(file()).isSymbolicLink()).toBe(false)
  })

  it('two jobs asking at once: only one gets it', async () => {
    // every job that asks is alive, so a lock that exists is never stale
    const results = await Promise.all(['a', 'b', 'c'].map(c => createFileLock({ dir, jobId: c.repeat(16), name: 'update', isRunning: async () => true }).acquire()))
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})
