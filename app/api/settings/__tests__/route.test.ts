// app/api/settings/__tests__/route.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

let db: TestDb
let route: typeof import('../route')

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  route = await import('../route')
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const put = (body: unknown) =>
  route.PUT(new Request('http://x/api/settings', { method: 'PUT', body: JSON.stringify(body) }))

describe('/api/settings', () => {
  it('saves and returns the cushion', async () => {
    const res = await put({ cushion: 4000 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cushion: 4000 })
    expect(await (await route.GET()).json()).toEqual({ cushion: 4000 })
  })

  it('rejects a bad amount in Hebrew', async () => {
    const res = await put({ cushion: -5 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/[א-ת]/)
  })

  it('rejects a broken body', async () => {
    const res = await route.PUT(new Request('http://x/api/settings', { method: 'PUT', body: '{' }))
    expect(res.status).toBe(400)
  })
})
