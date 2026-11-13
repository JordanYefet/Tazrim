/** Fakes for the updater tests: a Docker port, an app port and an in-memory status store. Fake values only. */

/** A fake image id in Docker's format */
export const OLD_IMAGE = `sha256:${'a'.repeat(64)}`

export const BACKUP = '/data/backups/pre-update-v1.0.0-to-v1.2.0-20261113-120000.db'

/** Every call lands in the shared `calls` log, so tests can check the order across Docker and the app */
export function fakes(opts = {}) {
  const calls = []
  const stopped = new Set()
  const docker = {
    async findTarget() {
      calls.push(['findTarget'])
      return {
        id: 'old-id',
        name: 'tazrim-tazrim-1',
        image: 'ghcr.io/jordanyefet/tazrim:1.0.0',
        imageId: OLD_IMAGE,
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
        Image: id === 'old-id' ? OLD_IMAGE : 'sha256:new',
        Config: { Image: 'ghcr.io/jordanyefet/tazrim:1.0.0' },
        State: { Running: !stopped.has(id), Health: { Status: 'healthy' } },
      }
    },
    async inspectImage(id) {
      calls.push(['inspectImage', id])
      if (opts.imageGone) throw new Error('Docker: No such image')
      return opts.image ?? { Id: id, RepoTags: ['ghcr.io/jordanyefet/tazrim:1.0.0'], RepoDigests: [] }
    },
    async stop(id) {
      calls.push(['stop', id])
      if (opts.stopFails) throw new Error('Docker: stop timed out')
      stopped.add(id)
    },
    async rename(id, name) {
      calls.push(['rename', id, name])
    },
    async createLike(inspected, image) {
      calls.push(['createLike', inspected.Id, image])
      if (opts.createFails) throw new Error('Docker: network not found')
      return 'new-id'
    },
    async start(id) {
      calls.push(['start', id])
      stopped.delete(id)
    },
    async waitHealthy(id, ms) {
      calls.push(['waitHealthy', id, ms])
      if (opts.unhealthy) throw new Error('the container became unhealthy')
    },
    async remove(id) {
      calls.push(['remove', id])
      if (opts.removeFails?.includes(id)) throw new Error('Docker: removal in progress')
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
  previousImage: OLD_IMAGE,
  finishedAt: '2026-11-13T12:05:00.000Z',
}
