import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { COMPOSE_SCRIPT_RELEASE } from '../config.mjs'
import { createComposeUpdate } from '../compose-update.mjs'
import { parseRecord, RECORD_FILE, sha256 } from '../compose-files.mjs'

const Y = 'docker-compose.yml'
const E = 'docker-compose.egress.yml'
const CTX = { project: 'tazrim-test', selfService: 'updater', workingDir: '/home/someone/tazrim', configFiles: ['/home/someone/tazrim/docker-compose.yml'], socket: '/var/run/docker.sock' }

// The fake releases: what GitHub has per tag and file
const RELEASES = {
  '1.0.0': { [Y]: 'services:\n  tazrim:\n    image: app:1.0.0\n', [E]: 'egress: one\n' },
  '1.2.0': { [Y]: 'services:\n  tazrim:\n    image: app:1.2.0\n  extra: {}\n', [E]: 'egress: two\n' },
}

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-compose-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const read = n => fs.readFileSync(path.join(dir, n), 'utf8')
const write = (n, t, mode = 0o644) => fs.writeFileSync(path.join(dir, n), t, { mode })
const exists = n => fs.existsSync(path.join(dir, n))
const record = () => parseRecord(exists(RECORD_FILE) ? read(RECORD_FILE) : null)
const baks = prefix => fs.readdirSync(dir).filter(n => n.startsWith(`${prefix}.bak-`)).sort()

function setup({ releases = RELEASES, context = { ctx: CTX }, upFails = 0, upHealthy = true, env = null, clock = null } = {}) {
  if (env !== null) write('.env', env)
  const calls = []
  let ups = 0
  const fetches = []
  const docker = {
    async runCli(ctx, image, script) {
      calls.push(['runCli', script])
      ups++
      if (ups <= upFails) return { exitCode: 1, output: 'service "tazrim" refers to undefined network' }
      return { exitCode: 0, output: '' }
    },
    async findTarget(opts) {
      calls.push(['findTarget', opts])
      return { id: 'app-id' }
    },
    async waitHealthy(id) {
      calls.push(['waitHealthy', id])
      if (!upHealthy) throw new Error('the container is unhealthy')
    },
  }
  const fetchImpl = async url => {
    const m = /contents\/(.+)\?ref=v(.+)$/.exec(url)
    fetches.push([m[2], m[1]])
    const text = releases[m[2]]?.[m[1]]
    if (text === undefined) return new Response('{}', { status: 404 })
    return new Response(text)
  }
  const egress = { has: false, hasApprovers() { return this.has } }
  const t = clock ?? { n: 0 }
  const c = createComposeUpdate({ config: { context: async () => context }, docker, egress, installDir: dir, fetchImpl, now: () => new Date(2026, 10, 20, 10, 0, t.n++), healthTimeoutMs: 1000 })
  return { c, calls, fetches, egress }
}

describe('plan', () => {
  it('untouched since Tazrim wrote it (recorded hash): replace, with a diff and the new hash; the egress file is created when missing', async () => {
    write(Y, RELEASES['1.0.0'][Y])
    write(RECORD_FILE, JSON.stringify({ files: { [Y]: sha256(RELEASES['1.0.0'][Y]) } }))
    const { c, fetches } = setup()
    const { view, work } = await c.plan('1.2.0', '1.0.0')
    expect(view).toMatchObject({ version: '1.2.0', applicable: true, needsApproval: true, approvers: false })
    const y = view.files.find(f => f.name === Y)
    expect(y).toMatchObject({ action: 'replace', sha256: sha256(RELEASES['1.2.0'][Y]) })
    expect(y.diff).toContain('-    image: app:1.0.0')
    expect(y.diff).toContain('+    image: app:1.2.0')
    expect(view.files.find(f => f.name === E)).toMatchObject({ action: 'create', sha256: sha256(RELEASES['1.2.0'][E]) })
    expect(work.changing.map(i => i.name)).toEqual([Y, E])
    // the record was there: the current tag is not asked for
    expect(fetches.every(([v]) => v === '1.2.0')).toBe(true)
  })

  it('no record: the file equal to the current release file is replaced; one that differs is edited (and nothing is written by a plan)', async () => {
    write(Y, RELEASES['1.0.0'][Y])
    write(E, 'egress: mine\n')
    const { c, fetches } = setup()
    const { view } = await c.plan('1.2.0', '1.0.0')
    expect(view.files.map(f => [f.name, f.action])).toEqual([[Y, 'replace'], [E, 'edited']])
    expect(fetches).toContainEqual(['1.0.0', Y])
    expect(view.files[1].diff).toContain('+egress: two')
    expect(fs.readdirSync(dir).sort()).toEqual([E, Y])
  })

  it('a failed fetch of the current release file makes the file edited, not an error', async () => {
    write(Y, RELEASES['1.0.0'][Y])
    const { c } = setup({ releases: { '1.2.0': RELEASES['1.2.0'] } })
    const { view } = await c.plan('1.2.0', '1.0.0')
    expect(view.files.find(f => f.name === Y).action).toBe('edited')
  })

  it('no current x.y.z means no base: edited', async () => {
    write(Y, RELEASES['1.0.0'][Y])
    const { c, fetches } = setup()
    const { view } = await c.plan('1.2.0', null)
    expect(view.files.find(f => f.name === Y).action).toBe('edited')
    expect(fetches.every(([v]) => v === '1.2.0')).toBe(true)
  })

  it('same and skip: identical file, a file the release does not have, a missing main file', async () => {
    write(Y, RELEASES['1.2.0'][Y])
    const { c } = setup({ releases: { '1.2.0': { [Y]: RELEASES['1.2.0'][Y] } } })
    const { view } = await c.plan('1.2.0', '1.0.0')
    expect(view.files.map(f => [f.name, f.action])).toEqual([[Y, 'same'], [E, 'skip']])
    expect(view.needsApproval).toBe(false)
    expect(view.files[1].sha256).toBeUndefined()

    fs.rmSync(path.join(dir, Y))
    expect((await setup().c.plan('1.2.0', '1.0.0')).view.files[0].action).toBe('skip')
  })

  it('a symlink or folder under a managed name is never followed or replaced', async () => {
    fs.writeFileSync(path.join(dir, 'real.yml'), 'x')
    fs.symlinkSync('real.yml', path.join(dir, Y))
    const { view } = await setup().c.plan('1.2.0', '1.0.0')
    expect(view.files.find(f => f.name === Y).action).toBe('skip')
  })

  it('a fetch failure of the target release throws COMPOSE_FETCH_FAILED', async () => {
    const { c } = setup({ releases: {} })
    // 404 everywhere is "no files", not a failure
    expect((await c.plan('1.2.0', '1.0.0')).view.files.every(f => f.action === 'skip')).toBe(true)
    const broken = createComposeUpdate({ config: { context: async () => ({ ctx: CTX }) }, docker: {}, installDir: dir, fetchImpl: async () => new Response('', { status: 500 }) })
    await expect(broken.plan('1.2.0', '1.0.0')).rejects.toMatchObject({ code: 'COMPOSE_FETCH_FAILED' })
  })

  it('does not apply: not a compose install, no /install, a custom tag; an x.y.z pin is fine', async () => {
    for (const reason of ['NO_INSTALL_MOUNT', 'NOT_COMPOSE', 'FOLDER_MISMATCH']) {
      const { view } = await setup({ context: { reason } }).c.plan('1.2.0', '1.0.0')
      expect(view).toEqual({ version: '1.2.0', applicable: false, reason, files: [], needsApproval: false, approvers: false })
    }
    expect((await setup({ env: 'TAZRIM_VERSION=preview-abc\n' }).c.plan('1.2.0', '1.0.0')).view).toMatchObject({ applicable: false, reason: 'CUSTOM_TAG' })
    expect((await setup({ env: 'TAZRIM_VERSION=1.0.0\n' }).c.plan('1.2.0', '1.0.0')).view.applicable).toBe(true)
  })

  it('says whether approvers exist', async () => {
    write(Y, RELEASES['1.0.0'][Y])
    const s = setup()
    s.egress.has = true
    expect((await s.c.plan('1.2.0', '1.0.0')).view.approvers).toBe(true)
  })
})

describe('apply', () => {
  async function planned(opts = {}, files = {}) {
    const mode = files.mode ?? 0o644
    write(Y, RELEASES['1.0.0'][Y], mode)
    write(E, 'egress: mine\n')
    const s = setup(opts)
    const p = await s.c.plan('1.2.0', '1.0.0')
    return { ...s, work: p.work }
  }

  it('backs up, writes, records, writes .new for an edited file, runs compose up with --remove-orphans and checks the app', async () => {
    const { c, calls, work } = await planned()
    const seen = []
    const r = await c.apply(work, { onBackups: b => seen.push(b) })
    expect(read(Y)).toBe(RELEASES['1.2.0'][Y])
    // edited: left alone, the release's text next to it
    expect(read(E)).toBe('egress: mine\n')
    expect(read(`${E}.new`)).toBe(RELEASES['1.2.0'][E])
    expect(record()).toEqual({ [Y]: sha256(RELEASES['1.2.0'][Y]) })
    expect(baks(Y)).toHaveLength(1)
    expect(read(baks(Y)[0])).toBe(RELEASES['1.0.0'][Y])
    expect(r.backups).toEqual({ [Y]: baks(Y)[0], [RECORD_FILE]: baks(RECORD_FILE)[0] })
    expect(seen[0]).toEqual(r.backups)
    expect(r.files).toEqual([{ name: Y, action: 'replace' }, { name: E, action: 'edited' }])
    const up = calls.find(x => x[0] === 'runCli')[1]
    expect(up).toBe(COMPOSE_SCRIPT_RELEASE)
    expect(up).toContain('up -d --remove-orphans')
    expect(up).not.toContain('TAZRIM_SELF')
    // the project is passed: the launcher itself may be gone by now
    expect(calls).toContainEqual(['findTarget', { project: 'tazrim-test' }])
    expect(calls).toContainEqual(['waitHealthy', 'app-id'])
    expect(fs.readdirSync(dir).filter(n => n.includes('.tmp-'))).toEqual([])
  })

  it('keeps the file mode (and replaces an older .new)', async () => {
    const { c, work } = await planned({}, { mode: 0o600 })
    write(`${E}.new`, 'old\n')
    await c.apply(work)
    expect(fs.statSync(path.join(dir, Y)).mode & 0o777).toBe(0o600)
    expect(read(`${E}.new`)).toBe(RELEASES['1.2.0'][E])
    expect(fs.statSync(path.join(dir, RECORD_FILE)).mode & 0o777).toBe(0o644)
  })

  it('creates a missing egress file and records it; no backup for what did not exist', async () => {
    write(Y, RELEASES['1.2.0'][Y])
    const { c } = setup()
    const { work } = await c.plan('1.2.0', '1.0.0')
    const r = await c.apply(work)
    expect(read(E)).toBe(RELEASES['1.2.0'][E])
    expect(record()).toEqual({ [Y]: sha256(RELEASES['1.2.0'][Y]), [E]: sha256(RELEASES['1.2.0'][E]) })
    expect(Object.keys(r.backups)).toEqual([RECORD_FILE])
  })

  it('keeps the newest 5 backups of each file', async () => {
    write(E, RELEASES['1.2.0'][E])
    for (let i = 0; i < 7; i++) write(`${Y}.bak-20260101-00000${i}`, `old ${i}`)
    write(Y, RELEASES['1.0.0'][Y])
    const { c } = setup()
    const { work } = await c.plan('1.2.0', '1.0.0')
    await c.apply(work)
    const names = baks(Y)
    expect(names).toHaveLength(5)
    expect(names).not.toContain(`${Y}.bak-20260101-000000`)
  })

  it('a pinned x.y.z TAZRIM_VERSION is bumped, nothing else in .env changes; no .env at all is fine', async () => {
    const env = '# mine\nTAZRIM_PORT=3000\nTAZRIM_VERSION=1.0.0 # pinned\n'
    write(Y, RELEASES['1.2.0'][Y])
    write(E, RELEASES['1.2.0'][E])
    const { c } = setup({ env })
    const { work } = await c.plan('1.2.0', '1.0.0')
    expect(work.steps).toBe(true)
    const r = await c.apply(work)
    expect(read('.env')).toBe('# mine\nTAZRIM_PORT=3000\nTAZRIM_VERSION=1.2.0 # pinned\n')
    expect(r.pin).toBe(true)
    expect(baks('.env')).toHaveLength(1)
    // a pin already at the new version, and nothing else to do: no step
    write('.env', 'TAZRIM_VERSION=1.2.0\n')
    expect((await setup().c.plan('1.2.0', '1.0.0')).work.steps).toBe(false)
  })

  it('a compose failure puts the files, the record, the .new files and .env back, runs compose again and says restored', async () => {
    const env = 'TAZRIM_VERSION=1.0.0\n'
    const { c, calls, work } = await planned({ upFails: 1, env })
    write(RECORD_FILE, JSON.stringify({ files: { [Y]: sha256(RELEASES['1.0.0'][Y]) } }))
    const before = record()
    const err = await c.apply(work).catch(e => e)
    expect(err).toMatchObject({ code: 'COMPOSE_FAILED', restored: true })
    expect(err.message).toMatch(/undefined network/)
    expect(read(Y)).toBe(RELEASES['1.0.0'][Y])
    expect(read(E)).toBe('egress: mine\n')
    expect(exists(`${E}.new`)).toBe(false)
    expect(read('.env')).toBe(env)
    expect(record()).toEqual(before)
    expect(calls.filter(x => x[0] === 'runCli')).toHaveLength(2)
    expect(Object.keys(err.backups)).toContain(Y)
  })

  it('a record that did not exist is removed again on a failure', async () => {
    const { c, work } = await planned({ upFails: 1 })
    await c.apply(work).catch(() => {})
    expect(exists(RECORD_FILE)).toBe(false)
  })

  it('an app that does not come back healthy is a compose failure too', async () => {
    const { c, work } = await planned({ upHealthy: false })
    const err = await c.apply(work).catch(e => e)
    expect(err).toMatchObject({ code: 'COMPOSE_FAILED' })
    expect(read(Y)).toBe(RELEASES['1.0.0'][Y])
  })

  it('says restored: false when the restoring compose run fails as well', async () => {
    const { c, work } = await planned({ upFails: 2 })
    const err = await c.apply(work).catch(e => e)
    expect(err).toMatchObject({ code: 'COMPOSE_FAILED' })
    // the files are back even though the second compose run failed
    expect(read(Y)).toBe(RELEASES['1.0.0'][Y])
    expect(err.restored).toBe(false)
  })
})

describe('restore (roll back)', () => {
  async function updated(env = null) {
    write(Y, RELEASES['1.0.0'][Y])
    write(E, RELEASES['1.0.0'][E])
    write(RECORD_FILE, JSON.stringify({ files: { [Y]: sha256(RELEASES['1.0.0'][Y]), [E]: sha256(RELEASES['1.0.0'][E]) } }))
    const s = setup({ env })
    const { work } = await s.c.plan('1.2.0', '1.0.0')
    const done = await s.c.apply(work)
    s.calls.length = 0
    return { ...s, done }
  }

  it('puts the backed up files and the record back, then runs compose up', async () => {
    const { c, calls, done } = await updated()
    expect(read(Y)).toBe(RELEASES['1.2.0'][Y])
    const r = await c.restore(done, { from: '1.0.0', to: '1.2.0' })
    expect(r).toEqual({ changed: true })
    expect(read(Y)).toBe(RELEASES['1.0.0'][Y])
    expect(read(E)).toBe(RELEASES['1.0.0'][E])
    expect(record()).toEqual({ [Y]: sha256(RELEASES['1.0.0'][Y]), [E]: sha256(RELEASES['1.0.0'][E]) })
    expect(calls.find(x => x[0] === 'runCli')[1]).toContain('--remove-orphans')
    expect(calls).toContainEqual(['waitHealthy', 'app-id'])
  })

  it('gives the pin back its old version, only while it still has the new one', async () => {
    const a = await updated('TAZRIM_VERSION=1.0.0\n')
    expect(read('.env')).toBe('TAZRIM_VERSION=1.2.0\n')
    await a.c.restore(a.done, { from: '1.0.0', to: '1.2.0' })
    expect(read('.env')).toBe('TAZRIM_VERSION=1.0.0\n')

    const b = await updated('TAZRIM_VERSION=1.0.0\n')
    write('.env', 'TAZRIM_VERSION=1.5.0\n')
    await b.c.restore({ backups: {}, pin: true }, { from: '1.0.0', to: '1.2.0' })
    expect(read('.env')).toBe('TAZRIM_VERSION=1.5.0\n')
  })

  it('takes only managed names and real backup names from the status file, and skips backups that are gone', async () => {
    const { c, done } = await updated()
    write('victim.txt', 'keep')
    write('evil.bak-20260101-000000', 'evil')
    const r = await c.restore(
      { backups: { 'victim.txt': 'evil.bak-20260101-000000', [Y]: '../etc/passwd', [E]: `${E}.bak-20200101-000000`, '.env': '.env.bak-20260101-000000' } },
      { from: '1.0.0', to: '1.2.0' }
    )
    expect(r).toEqual({ changed: false })
    expect(read('victim.txt')).toBe('keep')
    expect(read(Y)).toBe(RELEASES['1.2.0'][Y])
    expect(done.backups[Y]).toBeDefined()
  })

  it('a compose failure throws COMPOSE_FAILED', async () => {
    const { done } = await updated()
    const bad = createComposeUpdate({ config: { context: async () => ({ ctx: CTX }) }, docker: { async runCli() { return { exitCode: 1, output: 'boom' } } }, installDir: dir })
    await expect(bad.restore(done, { from: '1.0.0', to: '1.2.0' })).rejects.toMatchObject({ code: 'COMPOSE_FAILED' })
  })
})
