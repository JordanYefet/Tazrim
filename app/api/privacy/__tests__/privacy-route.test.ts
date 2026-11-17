import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

// The login and the identity check are mocked: the passkey and password checks
// themselves are covered with delete-all (lib/auth/__tests__/passkey-flow.test.ts).
const auth = vi.hoisted(() => ({ required: true, confirmed: false, calls: [] as unknown[] }))
vi.mock('@/lib/auth/config', () => ({ isAuthRequired: () => auth.required }))
vi.mock('@/lib/auth/confirm', () => ({
  confirmSignedInPerson: async (_req: Request, body: unknown, action: string) => {
    auth.calls.push({ body, action })
    return auth.confirmed ? null : NextResponse.json({ error: 'no' }, { status: 403 })
  },
}))

const { POST } = await import('../route')
const post = (body: unknown) =>
  POST(new Request('http://localhost:3000/api/privacy', { method: 'POST', headers: { host: 'localhost:3000' }, body: JSON.stringify(body) }))
const cookie = (res: Response) => res.headers.get('set-cookie') ?? ''

beforeEach(() => {
  auth.required = true
  auth.confirmed = false
  auth.calls = []
})

describe('POST /api/privacy', () => {
  it('hides the amounts without asking', async () => {
    const res = await post({ on: true })
    expect(res.status).toBe(200)
    expect(cookie(res)).toMatch(/tazrim_privacy=on/)
    expect(cookie(res)).toMatch(/HttpOnly/i)
    expect(auth.calls).toHaveLength(0)
  })

  it('shows them again only after the person confirms', async () => {
    const refused = await post({ on: false, password: 'wrong' })
    expect(refused.status).toBe(403)
    expect(cookie(refused)).toBe('')

    auth.confirmed = true
    const res = await post({ on: false, password: 'right' })
    expect(res.status).toBe(200)
    expect(cookie(res)).toMatch(/tazrim_privacy=off/)
    expect(auth.calls).toEqual([
      { body: { on: false, password: 'wrong' }, action: 'privacy-off' },
      { body: { on: false, password: 'right' }, action: 'privacy-off' },
    ])
  })

  it('with the login off, shows them without asking', async () => {
    auth.required = false
    const res = await post({ on: false })
    expect(res.status).toBe(200)
    expect(cookie(res)).toMatch(/tazrim_privacy=off/)
    expect(auth.calls).toHaveLength(0)
  })

  it('refuses a body without on', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ on: 'yes' })).status).toBe(400)
  })
})
