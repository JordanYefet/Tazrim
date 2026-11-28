import { describe, expect, it } from 'vitest'
import { SYNC_COMPANIES } from '@/lib/sync/providers'
import { MAIN_PORT, PROVIDER_PORTS, isProviderId, portOfProvider, providerOfPort } from '../provider-ports'

describe('provider ports (ENG-142)', () => {
  it('every company the sync can log in to has a port, and every port belongs to one', () => {
    for (const c of SYNC_COMPANIES) expect(portOfProvider(c.id), c.id).not.toBeNull()
    expect(Object.keys(PROVIDER_PORTS).sort()).toEqual(SYNC_COMPANIES.map(c => c.id).sort())
  })
  it('the ports are unique and never the main one; the lookup works both ways', () => {
    const ports = Object.values(PROVIDER_PORTS)
    expect(new Set(ports).size).toBe(ports.length)
    expect(ports).not.toContain(MAIN_PORT)
    for (const [id, port] of Object.entries(PROVIDER_PORTS)) expect(providerOfPort(port)).toBe(id)
    expect(providerOfPort(MAIN_PORT)).toBeNull()
    expect(providerOfPort(1)).toBeNull()
  })
  it('knows a provider id only when it is one (never a prototype name)', () => {
    expect(isProviderId('leumi')).toBe(true)
    expect(isProviderId('gamma')).toBe(false)
    expect(isProviderId('__proto__')).toBe(false)
    expect(isProviderId('constructor')).toBe(false)
    expect(isProviderId(7)).toBe(false)
    expect(portOfProvider('toString')).toBeNull()
  })
})
