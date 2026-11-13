import { describe, expect, it } from 'vitest'
import { containerIdFrom, createBody, repoOf } from '../docker.mjs'

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
