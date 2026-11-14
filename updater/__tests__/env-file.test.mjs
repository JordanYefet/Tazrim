import { describe, expect, it } from 'vitest'
import { applyChanges, configValues, effectiveValues, isHostName, isPrivateIPv4, parseEnv, validateChanges } from '../env-file.mjs'

const SAMPLE = `# Tazrim settings (fake values)
TAZRIM_PORT=3000

# the phones
export TAZRIM_PHONE_PORT = "3001"
TAZRIM_TZ=Asia/Jerusalem # keep
COMPOSE_PROFILES=updater
OTHER='a # not a comment'
`

describe('parseEnv / configValues', () => {
  it('reads values as compose does: quotes, export, inline comments', () => {
    expect(parseEnv(SAMPLE)).toEqual({
      TAZRIM_PORT: '3000',
      TAZRIM_PHONE_PORT: '3001',
      TAZRIM_TZ: 'Asia/Jerusalem',
      COMPOSE_PROFILES: 'updater',
      OTHER: 'a # not a comment',
    })
  })

  it('gives null for keys that are not in the file', () => {
    expect(configValues(SAMPLE)).toEqual({
      TAZRIM_PORT: '3000',
      TAZRIM_PHONE_PORT: '3001',
      COMPOSE_PROFILES: 'updater',
      TAZRIM_LAN_IP: null,
      TAZRIM_HOST: null,
      TAZRIM_DNS_HOST: null,
    })
    expect(configValues('').TAZRIM_PORT).toBeNull()
  })

  it('effective values fall back to the compose defaults', () => {
    expect(effectiveValues({ TAZRIM_PORT: null, TAZRIM_HOST: '' })).toMatchObject({ TAZRIM_PORT: '3000', TAZRIM_PHONE_PORT: '3001', TAZRIM_HOST: 'tazrim.internal' })
  })
})

describe('applyChanges', () => {
  it('updates in place and keeps every other line and comment exactly', () => {
    const out = applyChanges(SAMPLE, { TAZRIM_PORT: '3005', TAZRIM_PHONE_PORT: '3006' })
    expect(out).toBe(SAMPLE.replace('TAZRIM_PORT=3000', 'TAZRIM_PORT=3005').replace('export TAZRIM_PHONE_PORT = "3001"', 'export TAZRIM_PHONE_PORT = 3006'))
  })

  it('keeps an inline comment after an unquoted value', () => {
    expect(applyChanges('TAZRIM_PORT=3000  # the computer\n', { TAZRIM_PORT: '3005' })).toBe('TAZRIM_PORT=3005  # the computer\n')
  })

  it('appends a new key, adding the missing last newline first', () => {
    expect(applyChanges('A=1', { TAZRIM_LAN_IP: '192.168.1.20' })).toBe('A=1\nTAZRIM_LAN_IP=192.168.1.20\n')
    expect(applyChanges('', { TAZRIM_PORT: '3005' })).toBe('TAZRIM_PORT=3005\n')
  })

  it('removes a key set to null, every copy of it', () => {
    expect(applyChanges('TAZRIM_HOST=a.internal\n# x\nTAZRIM_HOST=b.internal\n', { TAZRIM_HOST: null })).toBe('# x\n')
  })

  it('rewrites every copy of a repeated key', () => {
    expect(applyChanges('TAZRIM_PORT=1\nTAZRIM_PORT=2\n', { TAZRIM_PORT: '3005' })).toBe('TAZRIM_PORT=3005\nTAZRIM_PORT=3005\n')
  })

  it('keeps Windows line endings', () => {
    expect(applyChanges('A=1\r\nTAZRIM_PORT=3000\r\n', { TAZRIM_PORT: '3005', TAZRIM_LAN_IP: '10.0.0.5' })).toBe('A=1\r\nTAZRIM_PORT=3005\r\nTAZRIM_LAN_IP=10.0.0.5\r\n')
  })

  it('leaves a commented-out key alone', () => {
    expect(applyChanges('# TAZRIM_PORT=3000\n', { TAZRIM_PORT: '3005' })).toBe('# TAZRIM_PORT=3000\nTAZRIM_PORT=3005\n')
  })
})

describe('validateChanges', () => {
  const cur = configValues(SAMPLE)

  it('accepts and normalizes good values', () => {
    expect(validateChanges({ TAZRIM_PORT: ' 3005 ', COMPOSE_PROFILES: 'dns,updater,https', TAZRIM_HOST: 'Money.Internal' }, cur)).toEqual({
      ok: true,
      changes: { TAZRIM_PORT: '3005', COMPOSE_PROFILES: 'updater,https,dns', TAZRIM_HOST: 'money.internal' },
    })
    expect(validateChanges({ TAZRIM_LAN_IP: '' }, cur).ok).toBe(true)
    expect(validateChanges({ TAZRIM_PORT: null }, { ...cur, TAZRIM_PHONE_PORT: '3002' }).ok).toBe(true)
  })

  it('refuses unknown keys, even with a good value', () => {
    for (const k of ['TAZRIM_TZ', 'TAZRIM_VERSION', 'PATH', '__proto__', 'tazrim_port']) {
      expect(validateChanges({ [k]: '3005' }, cur)).toMatchObject({ ok: false, code: 'UNKNOWN_KEY' })
    }
  })

  it('refuses bad values', () => {
    const bad = {
      TAZRIM_PORT: ['80', '1023', '65536', '03005', '3005\nX=1', '3005 #', 3005, ''],
      TAZRIM_PHONE_PORT: ['abc', '-1'],
      COMPOSE_PROFILES: ['updater,tools', 'updater;rm -rf /', null],
      TAZRIM_LAN_IP: ['8.8.8.8', '192.168.1', '192.168.1.256', '172.32.0.1', '010.0.0.1', '127.0.0.1'],
      TAZRIM_HOST: ['tazrim', 'a..b', '-a.internal', 'a.internal\nX=1', 'x y.internal', '1.2.3.4', ''],
      TAZRIM_DNS_HOST: ['$(id).internal'],
    }
    for (const [k, list] of Object.entries(bad)) {
      for (const v of list) expect(validateChanges({ [k]: v }, cur), `${k}=${JSON.stringify(v)}`).toMatchObject({ ok: false })
    }
  })

  it('refuses two equal ports, also against the default', () => {
    expect(validateChanges({ TAZRIM_PORT: '3001' }, cur)).toMatchObject({ ok: false, code: 'SAME_PORT', key: 'TAZRIM_PORT' })
    expect(validateChanges({ TAZRIM_PHONE_PORT: '3000' }, configValues(''))).toMatchObject({ ok: false, code: 'SAME_PORT' })
  })

  it('refuses the same name for the app and the DNS', () => {
    expect(validateChanges({ TAZRIM_HOST: 'dns.internal' }, cur)).toMatchObject({ ok: false, code: 'SAME_HOST' })
  })

  it('never turns the updater profile off', () => {
    expect(validateChanges({ COMPOSE_PROFILES: 'https,dns' }, cur)).toMatchObject({ ok: false, code: 'KEEP_UPDATER' })
    expect(validateChanges({ COMPOSE_PROFILES: '' }, cur)).toMatchObject({ ok: false, code: 'KEEP_UPDATER' })
  })

  it('refuses an empty or malformed request', () => {
    for (const c of [undefined, null, {}, [], 'TAZRIM_PORT=3005']) expect(validateChanges(c, cur).ok).toBe(false)
  })
})

describe('checks', () => {
  it('private IPv4 ranges only', () => {
    expect(['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.0.10'].every(isPrivateIPv4)).toBe(true)
    expect(['11.0.0.1', '172.15.0.1', '192.169.0.1', '::1'].some(isPrivateIPv4)).toBe(false)
  })
  it('host names with two labels or more', () => {
    expect(['tazrim.internal', 'a-b.home.arpa'].every(isHostName)).toBe(true)
    expect(['internal', 'a.-b', 'UPPER.internal'].some(isHostName)).toBe(false)
  })
})
