import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { containerIdFrom, createBody, createDocker, repoOf } from '../docker.mjs'

const ID = 'abc123def4567890'.padEnd(64, '0')

const oldImage = {
  Config: {
    Env: ['PATH=/usr/local/bin:/usr/bin', 'NODE_VERSION=22.0.0'],
    Cmd: ['node', 'server.js'],
    Entrypoint: ['docker-entrypoint.sh'],
    Labels: { 'org.opencontainers.image.version': '1.0.0', 'org.opencontainers.image.title': 'Tazrim' },
    Healthcheck: { Test: ['CMD', 'node', 'health.js'] },
    WorkingDir: '/app',
  },
}

const container = {
  Id: ID,
  Name: '/tazrim-tazrim-1',
  Image: 'sha256:old',
  Config: {
    Hostname: ID.slice(0, 12),
    Env: ['PATH=/usr/local/bin:/usr/bin', 'NODE_VERSION=22.0.0', 'TAZRIM_PORT=3000'],
    Cmd: ['node', 'server.js'],
    Entrypoint: ['docker-entrypoint.sh'],
    Labels: {
      'org.opencontainers.image.version': '1.0.0',
      'org.opencontainers.image.title': 'Tazrim',
      'com.docker.compose.project': 'tazrim',
      'com.docker.compose.service': 'tazrim',
    },
    Healthcheck: { Test: ['CMD', 'node', 'health.js'] },
    WorkingDir: '/app',
    ExposedPorts: { '3000/tcp': {} },
  },
  HostConfig: {
    NetworkMode: 'tazrim_default',
    Mounts: [{ Type: 'volume', Source: 'tazrim-data', Target: '/data' }],
    PortBindings: { '3000/tcp': [{ HostPort: '3100' }] },
    RestartPolicy: { Name: 'unless-stopped' },
  },
  NetworkSettings: {
    Networks: {
      tazrim_default: { Aliases: ['tazrim-tazrim-1', 'tazrim', ID.slice(0, 12)] },
      tazrim_edge: { Aliases: ['tazrim'] },
    },
  },
}

describe('createBody', () => {
  it('keeps what the container set and lets the new image bring its own defaults', () => {
    const { body, name, extraNetworks } = createBody(container, oldImage, 'ghcr.io/jordanyefet/tazrim:1.2.0')
    expect(name).toBe('tazrim-tazrim-1')
    expect(body.Image).toBe('ghcr.io/jordanyefet/tazrim:1.2.0')
    expect(body.Env).toEqual(['TAZRIM_PORT=3000'])
    expect(body.Labels).toEqual({ 'com.docker.compose.project': 'tazrim', 'com.docker.compose.service': 'tazrim' })
    expect(body.Cmd).toBeUndefined()
    expect(body.Entrypoint).toBeUndefined()
    expect(body.Healthcheck).toBeUndefined()
    expect(body.Hostname).toBeUndefined()
    expect(body.ExposedPorts).toEqual({ '3000/tcp': {} })
    expect(body.HostConfig).toEqual(container.HostConfig)
    expect(body.NetworkingConfig).toEqual({ EndpointsConfig: { tazrim_default: { Aliases: ['tazrim-tazrim-1', 'tazrim'] } } })
    expect(extraNetworks).toEqual([{ name: 'tazrim_edge', endpoint: { Aliases: ['tazrim'] } }])
  })

  it('keeps an overridden command and healthcheck', () => {
    const c = structuredClone(container)
    c.Config.Cmd = ['node', 'other.js']
    c.Config.Healthcheck = { Test: ['NONE'] }
    const { body } = createBody(c, oldImage, 'ghcr.io/jordanyefet/tazrim:1.2.0')
    expect(body.Cmd).toEqual(['node', 'other.js'])
    expect(body.Healthcheck).toEqual({ Test: ['NONE'] })
  })
})

describe('repoOf', () => {
  it('drops the tag or digest', () => {
    expect(repoOf('ghcr.io/jordanyefet/tazrim:1.2.0')).toBe('ghcr.io/jordanyefet/tazrim')
    expect(repoOf('ghcr.io/jordanyefet/tazrim')).toBe('ghcr.io/jordanyefet/tazrim')
    expect(repoOf('ghcr.io/jordanyefet/tazrim@sha256:abc')).toBe('ghcr.io/jordanyefet/tazrim')
    expect(repoOf('localhost:5000/tazrim:dev')).toBe('localhost:5000/tazrim')
  })
})

describe('containerIdFrom', () => {
  it('reads the container id from mountinfo', () => {
    const mountinfo = `1 2 0:1 / / rw - overlay overlay rw\n3 1 8:1 /var/lib/docker/containers/${ID}/hostname /etc/hostname rw - ext4 /dev/sda1 rw\n`
    expect(containerIdFrom(mountinfo, 'fallback')).toBe(ID)
    expect(containerIdFrom('nothing here', 'fallback')).toBe('fallback')
  })
})

/** A fake Docker daemon on a unix socket: `handler(method, url)` -> [status, body] */
async function fakeDaemon(handler) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tzu-'))
  const socketPath = path.join(dir, 'd.sock')
  const seen = []
  const server = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      seen.push(`${req.method} ${req.url}`)
      const [status, body] = handler(req.method, req.url)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(body === undefined ? '' : JSON.stringify(body))
    })
  })
  await new Promise(r => server.listen(socketPath, r))
  const close = () =>
    new Promise(r => server.close(r)).then(() => fs.rmSync(dir, { recursive: true, force: true }))
  return { socketPath, seen, close }
}

describe('createLike', () => {
  it('removes the container it made when connecting a network fails', async () => {
    const daemon = await fakeDaemon((method, url) => {
      if (url.includes('/images/')) return [200, oldImage]
      if (url.includes('/containers/create')) return [201, { Id: 'fresh-id' }]
      if (url.includes('/connect')) return [500, { message: 'network tazrim_edge not found' }]
      if (method === 'DELETE') return [204]
      return [404, { message: 'unexpected' }]
    })
    try {
      const docker = createDocker({ socketPath: daemon.socketPath, selfId: 'x' })
      await expect(docker.createLike(container, 'ghcr.io/jordanyefet/tazrim:1.2.0')).rejects.toThrow(/network tazrim_edge not found/)
      expect(daemon.seen).toContain('DELETE /v1.43/containers/fresh-id?force=true&v=false')
    } finally {
      await daemon.close()
    }
  })
})
