import { beforeEach, describe, expect, it, vi } from 'vitest'

const helper = vi.hoisted(() => ({ health: null as unknown, responses: {} as Record<string, { status: number; json: unknown } | null>, posts: [] as unknown[], configJob: null as unknown }))
vi.mock('@/lib/updates/helper', () => ({
  helperHealth: async () => helper.health,
  helperIsReady: (h: { api?: number } | null) => h?.api === 2,
  helperConfigJob: async () => helper.configJob,
  runJob: async (name: string, input?: unknown) => {
    helper.posts.push([name, input])
    return helper.responses[name] ?? null
  },
}))

import { getInstallView, startConfigChange } from '../config'
import { nextOrigin } from '@/components/install/container-settings'

const health = (api = 2) => ({ ok: true, api, launcherVersion: '1.0.0' })
const FILE = { TAZRIM_PORT: '3005', TAZRIM_PHONE_PORT: null, COMPOSE_PROFILES: 'updater', TAZRIM_LAN_IP: null, TAZRIM_HOST: null, TAZRIM_DNS_HOST: null, TAZRIM_DNS_BIND: null }

beforeEach(() => {
  helper.health = null
  helper.responses = {}
  helper.posts = []
  helper.configJob = null
  vi.stubEnv('TAZRIM_PORT', '3200')
  vi.stubEnv('TAZRIM_PHONE_PORT', '3201')
  vi.stubEnv('TAZRIM_PROFILES', 'https')
})

describe('getInstallView', () => {
  it('without a helper: what compose passed in, manual steps', async () => {
    expect(await getInstallView()).toMatchObject({ helper: 'none', values: { TAZRIM_PORT: '3200', TAZRIM_PHONE_PORT: '3201', COMPOSE_PROFILES: 'https', TAZRIM_HOST: 'tazrim.internal' }, fileValues: null })
  })

  it('an older updater (api 1) is "old", and is not asked to run anything', async () => {
    helper.health = health(1)
    expect((await getInstallView()).helper).toBe('old')
    expect(helper.posts).toEqual([])
  })

  it('a helper without the install folder is "unavailable" with its reason', async () => {
    helper.health = health()
    helper.responses['config-info'] = { status: 200, json: { available: false, reason: 'NO_INSTALL_MOUNT', values: {}, installDir: null } }
    expect(await getInstallView()).toMatchObject({ helper: 'unavailable', reason: 'NO_INSTALL_MOUNT' })
  })

  it('ready: the file values, defaults filled in, and the job without its English error', async () => {
    helper.health = health()
    helper.responses['config-info'] = { status: 200, json: { available: true, values: FILE, installDir: '/home/someone/tazrim' } }
    helper.configJob = { id: 'j1', kind: 'config', state: 'failed', restored: true, code: 'PORT_BUSY', error: 'Bind for 0.0.0.0:3100 failed', changes: { TAZRIM_PORT: '3100' }, steps: [{ id: 'apply', state: 'failed' }], backup: '.env.bak-x' }
    const v = await getInstallView()
    expect(v).toMatchObject({ helper: 'ready', installDir: '/home/someone/tazrim', values: { TAZRIM_PORT: '3005', TAZRIM_PHONE_PORT: '3001' } })
    expect(v.job).toEqual({ id: 'j1', state: 'failed', restored: true, keys: ['TAZRIM_PORT'], steps: [{ id: 'apply', state: 'failed' }], code: 'PORT_BUSY' })
  })

  it('a failure that could not be put back says so', async () => {
    helper.health = health()
    helper.responses['config-info'] = { status: 200, json: { available: true, values: FILE, installDir: '/x' } }
    helper.configJob = { id: 'j', kind: 'config', state: 'failed', restored: false, code: 'APPLY_FAILED', changes: {}, steps: [] }
    expect((await getInstallView()).job?.code).toBe('NOT_RESTORED')
  })
})

describe('startConfigChange', () => {
  it('refuses bad values before asking the helper', async () => {
    expect(await startConfigChange({ TAZRIM_PORT: '80' }, FILE)).toMatchObject({ status: 400, code: 'INVALID_VALUE', key: 'TAZRIM_PORT' })
    expect(await startConfigChange({ TAZRIM_TZ: 'UTC' }, FILE)).toMatchObject({ status: 400, code: 'UNKNOWN_KEY' })
    expect(helper.posts).toEqual([])
  })

  it('sends the normalized changes', async () => {
    helper.responses.config = { status: 202, json: { job: { id: 'j2', kind: 'config', state: 'running', changes: { TAZRIM_PORT: '3007' }, steps: [] } } }
    expect(await startConfigChange({ TAZRIM_PORT: ' 3007 ' }, FILE)).toMatchObject({ status: 202, job: { id: 'j2', keys: ['TAZRIM_PORT'] } })
    expect(helper.posts).toEqual([['config', { changes: { TAZRIM_PORT: '3007' } }]])
  })

  it('a launcher that does not know the job means no helper', async () => {
    helper.responses.config = { status: 404, json: { error: 'not found' } }
    expect(await startConfigChange({ TAZRIM_PORT: '3007' }, FILE)).toMatchObject({ status: 503, code: 'NO_HELPER' })
  })
})

describe('nextOrigin', () => {
  const before = { TAZRIM_PORT: '3000', TAZRIM_PHONE_PORT: '3001', COMPOSE_PROFILES: '', TAZRIM_LAN_IP: '', TAZRIM_HOST: 'tazrim.internal', TAZRIM_DNS_HOST: 'dns.internal', TAZRIM_DNS_BIND: '127.0.0.1' }
  it('follows the port the page is on', () => {
    expect(nextOrigin('http://localhost:3000/settings/install', before, { ...before, TAZRIM_PORT: '3005' })).toBe('http://localhost:3005')
    expect(nextOrigin('http://192.168.1.20:3001/settings/install', before, { ...before, TAZRIM_PHONE_PORT: '3006' })).toBe('http://192.168.1.20:3006')
  })
  it('stays put when another port changes, or behind HTTPS', () => {
    expect(nextOrigin('http://localhost:3000/x', before, { ...before, TAZRIM_PHONE_PORT: '3006' })).toBe('http://localhost:3000')
    expect(nextOrigin('https://tazrim.internal/x', before, { ...before, TAZRIM_PORT: '3005' })).toBe('https://tazrim.internal')
  })
})
