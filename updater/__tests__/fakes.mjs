/** Fakes for the updater tests: a Docker port, an app port and an in-memory status store. Fake values only. */

export const BACKUP = '/data/backups/pre-update-v1.0.0-to-v1.2.0-20261113-120000.db'

/** Every call lands in the shared `calls` log, so tests can check the order across Docker and the app */
export function fakes(opts = {}) {
  const calls = []
  const docker = {
    async findTarget() {
      calls.push(['findTarget'])
      return {
        id: 'old-id',
        name: 'tazrim-tazrim-1',
        image: 'ghcr.io/jordanyefet/tazrim:1.0.0',
        imageId: 'sha256:old',
        version: 'version' in opts ? opts.version : '1.0.0',
        updatable: opts.updatable ?? true,
      }
    },
    async pull(image, tag, onProgress) {
      calls.push(['pull', image, tag])
      if (opts.pullGate) await opts.pullGate
      if (opts.pullFails) throw new Error('manifest unknown')
      onProgress({ current: 50, total: 100 })
      onProgress({ current: 100, total: 100 })
    },
    async inspect(id) {
      calls.push(['inspect', id])
      return {
        Id: id,
        Name: '/tazrim-tazrim-1',
        Image: id === 'old-id' ? 'sha256:old' : 'sha256:new',
        Config: { Image: 'ghcr.io/jordanyefet/tazrim:1.0.0' },
        State: { Running: true, Health: { Status: 'healthy' } },
      }
    },
    async stop(id) {
      calls.push(['stop', id])
    },
    async rename(id, name) {
      calls.push(['rename', id, name])
    },
    async createLike(inspected, image) {
      calls.push(['createLike', inspected.Id, image])
      return 'new-id'
    },
    async start(id) {
      calls.push(['start', id])
    },
    async waitHealthy(id, ms) {
      calls.push(['waitHealthy', id, ms])
      if (opts.unhealthy) throw new Error('the container became unhealthy')
    },
    async remove(id) {
      calls.push(['remove', id])
    },
    async tag(imageId, repo, tag) {
      calls.push(['tag', imageId, repo, tag])
    },
  }
  const app = {
    async requestBackup(from, to) {
      calls.push(['requestBackup', from, to])
      if (opts.syncRunning) throw Object.assign(new Error('A bank sync is running. Try again when it ends.'), { code: 'SYNC_RUNNING' })
      return BACKUP
    },
    async clearFlag() {
      calls.push(['clearFlag'])
    },
    async restoreBackup(file) {
      calls.push(['restoreBackup', file])
    },
    backupExists(file) {
      calls.push(['backupExists', file])
      return opts.backupMissing ? false : true
    },
    async setAside() {
      calls.push(['setAside'])
      return '/data/backups/before-rollback-20261113-120500'
    },
    async putBack(dir) {
      calls.push(['putBack', dir])
    },
  }
  return { calls, docker, app }
}

/** A status store that keeps every saved snapshot */
export function memStore(initial = null) {
  let current = initial ? structuredClone(initial) : null
  const saves = []
  return {
    saves,
    get: () => (current ? structuredClone(current) : null),
    save(s) {
      current = structuredClone(s)
      saves.push(structuredClone(s))
    },
  }
}

/** A finished, successful update as the status file would hold it */
export const doneUpdate = {
  kind: 'update',
  from: '1.0.0',
  to: '1.2.0',
  state: 'done',
  restored: false,
  steps: ['backup', 'download', 'restart', 'migrate', 'check'].map(id => ({ id, state: 'done' })),
  backup: BACKUP,
  previousImage: 'sha256:old',
  finishedAt: '2026-11-13T12:05:00.000Z',
}
