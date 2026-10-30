import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

// Made-up values only.

let db: TestDb
let route: typeof import('../generic-descriptions/route')

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost:3000/api/bank/generic-descriptions', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "BankTransaction" ("id","accountId","date","originalDescription","description","debit","credit","balance","category","categoryManual","sourceFile") VALUES
    ('t1','acct_leumi',1900000000000,'FAKE CHEQUE','FAKE CHEQUE',100,0,1000,'Fake Rent',false,'fake.xlsx');`)
  usePrismaOn(db)
  route = await import('../generic-descriptions/route')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('/api/bank/generic-descriptions', () => {
  it('POST marks one and lists the rows it cleared; GET lists it; DELETE takes it off', async () => {
    const res = await route.POST(req('POST', { description: 'FAKE CHEQUE' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ description: 'FAKE CHEQUE', clearedIds: ['t1'] })
    expect(await (await route.GET()).json()).toContain('FAKE CHEQUE')

    expect((await route.DELETE(req('DELETE', { description: 'FAKE CHEQUE' }))).status).toBe(200)
    expect(await (await route.GET()).json()).not.toContain('FAKE CHEQUE')
  })

  it('400 for a missing, empty or malformed description', async () => {
    for (const body of [undefined, 'not json', {}, { description: '  ' }, { description: 3 }]) {
      expect((await route.POST(req('POST', body))).status).toBe(400)
      expect((await route.DELETE(req('DELETE', body))).status).toBe(400)
    }
  })
})
