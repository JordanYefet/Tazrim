import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The household's providers go to the updater (ENG-142). Made-up accounts only.
const mocks = vi.hoisted(() => ({
  accounts: [] as { kind: string; provider: string }[],
  calls: [] as { name: string; input: unknown }[],
  answer: { status: 200 } as { status: number } | null,
  gate: null as Promise<void> | null,
}))
vi.mock('@/lib/db/client', () => ({ prisma: { account: { findMany: async () => mocks.accounts } } }))
vi.mock('@/lib/updates/helper', () => ({
  runJob: async (name: string, input: unknown) => {
    mocks.calls.push({ name, input })
    if (mocks.gate) await mocks.gate
    return mocks.answer
  },
}))

let mod: typeof import('../household')
beforeEach(async () => {
  vi.resetModules()
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('tazrim.egress.household')]
  mocks.accounts = [
    { kind: 'BANK', provider: 'leumi' },
    { kind: 'CREDIT_CARD', provider: 'max' },
    { kind: 'CREDIT_CARD', provider: 'max' },
    { kind: 'BANK', provider: 'some-bank-we-cannot-sync' },
  ]
  mocks.calls = []
  mocks.answer = { status: 200 }
  mocks.gate = null
  process.env.TAZRIM_EGRESS = '1'
  delete process.env.TAZRIM_READ_ONLY
  mod = await import('../household')
})
afterEach(() => {
  delete process.env.TAZRIM_EGRESS
  vi.useRealTimers()
})

describe('householdProviderIds', () => {
  it('the companies the accounts sync through, once each, sorted; providers with no scraper are left out', async () => {
    expect(await mod.householdProviderIds()).toEqual(['leumi', 'max'])
  })
  it('a card and a bank of the same provider name are different companies (kind decides)', async () => {
    mocks.accounts = [{ kind: 'BANK', provider: 'max' }]
    expect(await mod.householdProviderIds()).toEqual([])
  })
})

describe('pushHouseholdProviders', () => {
  it('sends the ids to the egress-providers job', async () => {
    expect(await mod.pushHouseholdProviders()).toBe(true)
    expect(mocks.calls).toEqual([{ name: 'egress-providers', input: { ids: ['leumi', 'max'] } }])
  })
  it('adds the company a sync is about to start, once, and drops what is not a company', async () => {
    await mod.pushHouseholdProviders({ include: ['visaCal', 'leumi', 'nope', '__proto__'] })
    expect(mocks.calls[0].input).toEqual({ ids: ['leumi', 'max', 'visaCal'] })
  })
  it('asks again only when the household changed or `force` says so (a sync start is a cheap no-op)', async () => {
    await mod.pushHouseholdProviders()
    await mod.pushHouseholdProviders()
    expect(mocks.calls).toHaveLength(1)
    mocks.accounts.push({ kind: 'BANK', provider: 'hapoalim' })
    await mod.pushHouseholdProviders()
    expect(mocks.calls).toHaveLength(2)
    await mod.pushHouseholdProviders({ force: true })
    expect(mocks.calls).toHaveLength(3)
  })
  it('a refusal or no answer is false, never thrown, and is asked again next time', async () => {
    mocks.answer = null
    expect(await mod.pushHouseholdProviders()).toBe(false)
    mocks.answer = { status: 500 }
    expect(await mod.pushHouseholdProviders()).toBe(false)
    mocks.answer = { status: 200 }
    expect(await mod.pushHouseholdProviders()).toBe(true)
    expect(mocks.calls).toHaveLength(3)
  })
  it('calls follow one another, the later one seeing the household as it is then', async () => {
    let open!: () => void
    mocks.gate = new Promise<void>(r => (open = r))
    const first = mod.pushHouseholdProviders({ force: true })
    await vi.waitFor(() => expect(mocks.calls).toHaveLength(1))
    mocks.accounts.push({ kind: 'BANK', provider: 'hapoalim' })
    const second = mod.pushHouseholdProviders({ force: true })
    open()
    await Promise.all([first, second])
    expect(mocks.calls.map(c => c.input)).toEqual([{ ids: ['leumi', 'max'] }, { ids: ['hapoalim', 'leumi', 'max'] }])
  })
  it('does nothing without isolation (the helper is not asked)', async () => {
    delete process.env.TAZRIM_EGRESS
    expect(await mod.pushHouseholdProviders()).toBe(true)
    expect(mocks.calls).toEqual([])
  })
})

describe('householdChanged and startHouseholdSync', () => {
  it('an account change tells the updater, in the background', async () => {
    mod.householdChanged()
    await vi.waitFor(() => expect(mocks.calls).toHaveLength(1))
    delete process.env.TAZRIM_EGRESS
    mod.householdChanged()
    await new Promise(r => setTimeout(r, 10))
    expect(mocks.calls).toHaveLength(1)
  })
  it('the server start tries until the updater answers, then stops', async () => {
    vi.useFakeTimers()
    mocks.answer = null
    mod.startHouseholdSync([0, 1000, 5000, 20000])
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.calls).toHaveLength(2)
    mocks.answer = { status: 200 }
    await vi.advanceTimersByTimeAsync(4000)
    expect(mocks.calls).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.calls).toHaveLength(3)
  })
})
