import { describe, expect, it } from 'vitest'
import { POST } from '../route'

const post = (body: unknown) =>
  POST(new Request('http://localhost:3000/api/privacy', { method: 'POST', headers: { host: 'localhost:3000' }, body: JSON.stringify(body) }))
const cookie = (res: Response) => res.headers.get('set-cookie') ?? ''

describe('POST /api/privacy', () => {
  it('hides the amounts', async () => {
    const res = await post({ on: true })
    expect(res.status).toBe(200)
    expect(cookie(res)).toMatch(/tazrim_privacy=on/)
    expect(cookie(res)).toMatch(/HttpOnly/i)
  })

  it('shows them again without asking', async () => {
    const res = await post({ on: false })
    expect(res.status).toBe(200)
    expect(cookie(res)).toMatch(/tazrim_privacy=off/)
  })

  it('refuses a body without on', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ on: 'yes' })).status).toBe(400)
  })
})
