import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.mjs'

let dir, db, app, requests, reply

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-updater-'))
  db = path.join(dir, 'tazrim.db')
  fs.mkdirSync(path.join(dir, 'backups'))
  requests = []
  reply = { status: 200, body: {} }
  const fetchImpl = async (url, init) => {
    requests.push({ url, method: init.method, auth: init.headers.Authorization, body: init.body })
    if (reply.throws) throw new Error('connect ECONNREFUSED')
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  }
  app = createApp({ url: 'http://tazrim:3000', token: 'fake-token', dbFile: db, fetchImpl, owner: null })
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('requestBackup', () => {
  it('asks the app with the token and maps the file into the helper volume', async () => {
    const name = 'pre-update-v1.0.0-to-v1.2.0-20261113-120000.db'
    fs.writeFileSync(path.join(dir, 'backups', name), 'fake backup')
    reply.body = { file: `/data/backups/${name}`, from: '1.0.0' }
    expect(await app.requestBackup('1.0.0', '1.2.0')).toEqual({ file: path.join(dir, 'backups', name), from: '1.0.0' })
    expect(requests[0]).toMatchObject({ url: 'http://tazrim:3000/api/updates/backup', method: 'POST', auth: 'Bearer fake-token' })
    expect(JSON.parse(requests[0].body)).toEqual({ from: '1.0.0', to: '1.2.0' })
  })

  it('for an image without a version label, takes the version the app names itself by', async () => {
    const name = 'pre-update-v0.9.0-to-v1.2.0-20261113-120000.db'
    fs.writeFileSync(path.join(dir, 'backups', name), 'fake backup')
    reply.body = { file: `/data/backups/${name}`, from: '0.9.0' }
    expect(await app.requestBackup('unknown', '1.2.0')).toEqual({ file: path.join(dir, 'backups', name), from: '0.9.0' })
    expect(JSON.parse(requests[0].body)).toEqual({ from: 'unknown', to: '1.2.0' })
    expect(app.backupExists(path.join(dir, 'backups', name))).toBe(true)
  })

  it('an app that sends no version (or an odd one) leaves `from` unknown', async () => {
    const name = 'pre-update-v0.9.0-to-v1.2.0-20261113-120000.db'
    fs.writeFileSync(path.join(dir, 'backups', name), 'fake backup')
    reply.body = { file: `/data/backups/${name}` }
    expect((await app.requestBackup('unknown', '1.2.0')).from).toBeNull()
    reply.body = { file: `/data/backups/${name}`, from: '1.0.0; x' }
    expect((await app.requestBackup('unknown', '1.2.0')).from).toBeNull()
  })

  it('says a sync is running on 409 SYNC_RUNNING', async () => {
    reply.status = 409
    reply.body = { code: 'SYNC_RUNNING' }
    await expect(app.requestBackup('1.0.0', '1.2.0')).rejects.toMatchObject({ code: 'SYNC_RUNNING' })
  })

  it('refuses a missing, empty or oddly named backup file', async () => {
    reply.body = { file: '/data/backups/pre-update-v1.0.0-to-v1.2.0-20261113-120000.db' }
    await expect(app.requestBackup('1.0.0', '1.2.0')).rejects.toThrow()
    fs.writeFileSync(path.join(dir, 'backups', 'pre-update-v1.0.0-to-v1.2.0-20261113-120000.db'), '')
    await expect(app.requestBackup('1.0.0', '1.2.0')).rejects.toThrow()
    reply.body = { file: '/data/tazrim.db' }
    fs.writeFileSync(db, 'live')
    await expect(app.requestBackup('1.0.0', '1.2.0')).rejects.toThrow()
  })
})

describe('restoreBackup', () => {
  it('drops -wal/-shm and copies the backup over the database', async () => {
    const backup = path.join(dir, 'backups', 'pre-update-v1.0.0-to-v1.2.0-20261113-120000.db')
    fs.writeFileSync(backup, 'old data')
    fs.writeFileSync(db, 'new data')
    fs.writeFileSync(db + '-wal', 'wal')
    fs.writeFileSync(db + '-shm', 'shm')
    await app.restoreBackup(backup)
    expect(fs.readFileSync(db, 'utf8')).toBe('old data')
    expect(fs.existsSync(db + '-wal')).toBe(false)
    expect(fs.existsSync(db + '-shm')).toBe(false)
    expect(fs.readFileSync(backup, 'utf8')).toBe('old data')
  })

  it('refuses a file outside the backups folder', async () => {
    fs.writeFileSync(path.join(dir, 'elsewhere.db'), 'x')
    await expect(app.restoreBackup(path.join(dir, 'elsewhere.db'))).rejects.toThrow()
  })
})

describe('symlinks planted in the data folder', () => {
  const name = 'pre-update-v1.0.0-to-v1.2.0-20261113-120000.db'

  it('restoring never writes through a planted temp-file link', async () => {
    const backup = path.join(dir, 'backups', name)
    fs.writeFileSync(backup, 'old data')
    const victim = path.join(dir, 'victim')
    fs.writeFileSync(victim, 'precious')
    fs.symlinkSync(victim, db + '.restoring')
    await app.restoreBackup(backup)
    expect(fs.readFileSync(victim, 'utf8')).toBe('precious')
    expect(fs.lstatSync(db).isSymbolicLink()).toBe(false)
    expect(fs.readFileSync(db, 'utf8')).toBe('old data')
  })

  it('a backup that is a link is no backup', async () => {
    const victim = path.join(dir, 'victim')
    fs.writeFileSync(victim, 'secret')
    fs.symlinkSync(victim, path.join(dir, 'backups', name))
    expect(app.backupExists(path.join(dir, 'backups', name))).toBe(false)
    await expect(app.restoreBackup(path.join(dir, 'backups', name))).rejects.toThrow()
    reply.body = { file: `/data/backups/${name}` }
    await expect(app.requestBackup('1.0.0', '1.2.0')).rejects.toThrow()
  })

  it('a backups folder that is a link is refused', async () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-elsewhere-'))
    try {
      fs.writeFileSync(path.join(elsewhere, name), 'x')
      fs.rmSync(path.join(dir, 'backups'), { recursive: true })
      fs.symlinkSync(elsewhere, path.join(dir, 'backups'))
      fs.writeFileSync(db, 'live')
      expect(app.backupExists(path.join(dir, 'backups', name))).toBe(false)
      await expect(app.restoreBackup(path.join(dir, 'backups', name))).rejects.toThrow()
      await expect(app.setAside()).rejects.toThrow()
      expect(fs.readFileSync(db, 'utf8')).toBe('live')
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true })
    }
  })
})

describe('setAside / putBack', () => {
  it('a prune that fails still hands back the set-aside folder, so a failed roll back can put the database back', async () => {
    const failingPrune = { ...fs, readdirSync: () => { throw new Error('EIO: fake read error') } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const shaky = createApp({ url: 'http://tazrim:3000', token: 'fake-token', dbFile: db, fetchImpl: async () => new Response('{}'), owner: null, fs: failingPrune })
    fs.writeFileSync(db, 'live')
    const kept = await shaky.setAside()
    expect(fs.existsSync(path.join(kept, 'tazrim.db'))).toBe(true)
    expect(warn).toHaveBeenCalled()
    await shaky.putBack(kept)
    expect(fs.readFileSync(db, 'utf8')).toBe('live')
    warn.mockRestore()
  })

  it('names the folder in local time and keeps the newest 3', async () => {
    let t = new Date(2026, 10, 13, 9, 5, 0)
    const timed = createApp({ url: 'http://tazrim:3000', token: 'fake-token', dbFile: db, fetchImpl: async () => new Response('{}'), owner: null, now: () => t })
    const made = []
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(db, `live ${i}`)
      made.push(path.basename(await timed.setAside()))
      t = new Date(t.getTime() + 60_000)
    }
    expect(made[0]).toBe('before-rollback-20261113-090500')
    const left = fs.readdirSync(path.join(dir, 'backups')).filter(n => n.startsWith('before-rollback-')).sort()
    expect(left).toEqual(made.slice(2))
    expect(fs.readFileSync(path.join(dir, 'backups', made[4], 'tazrim.db'), 'utf8')).toBe('live 4')
  })

  it('moves the live database away and back', async () => {
    fs.writeFileSync(db, 'live')
    fs.writeFileSync(db + '-wal', 'wal')
    const kept = await app.setAside()
    expect(fs.existsSync(db)).toBe(false)
    fs.writeFileSync(db, 'restored')
    await app.putBack(kept)
    expect(fs.readFileSync(db, 'utf8')).toBe('live')
    expect(fs.readFileSync(db + '-wal', 'utf8')).toBe('wal')
  })
})

describe('clearFlag', () => {
  it('asks the app, and removes the flag file itself when the app does not answer', async () => {
    fs.writeFileSync(path.join(dir, '.updating'), 'x')
    reply.throws = true
    await app.clearFlag()
    expect(requests[0]).toMatchObject({ url: 'http://tazrim:3000/api/updates/backup', method: 'DELETE', auth: 'Bearer fake-token' })
    expect(fs.existsSync(path.join(dir, '.updating'))).toBe(false)
  })
})

describe('backupExists', () => {
  it('is true only for a non-empty file in the backups folder', () => {
    const backup = path.join(dir, 'backups', 'pre-update-v1.0.0-to-v1.2.0-20261113-120000.db')
    expect(app.backupExists(backup)).toBe(false)
    fs.writeFileSync(backup, 'x')
    expect(app.backupExists(backup)).toBe(true)
    fs.writeFileSync(db, 'x')
    expect(app.backupExists(db)).toBe(false)
  })
})
