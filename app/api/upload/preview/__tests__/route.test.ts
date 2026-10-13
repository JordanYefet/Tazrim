import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'
import { TEST_ACCOUNTS_SQL } from '@/lib/upload/__tests__/fixtures'
import { MAX_PREVIEW_ROWS, MAX_FILE_BYTES } from '@/lib/upload/preview-limits'

// All values below are made up.

let db: TestDb
let POST: (req: Request) => Promise<Response>

beforeAll(async () => {
  db = createTestDb()
  db.exec(TEST_ACCOUNTS_SQL)
  usePrismaOn(db)
  POST = (await import('../route')).POST as unknown as typeof POST
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

function req(file?: File, accountId: string | null = 'acct_leumi'): Request {
  const form = new FormData()
  if (file) form.append('file', file)
  if (accountId) form.append('accountId', accountId)
  return new Request('http://localhost/api/upload/preview', { method: 'POST', body: form })
}

describe('POST /api/upload/preview', () => {
  it('returns the raw workbook preview and the account it is for', async () => {
    const csv = 'תאריך,סכום\n' + Array.from({ length: MAX_PREVIEW_ROWS + 5 }, (_, i) => `2030-01-01,${i}`).join('\n')
    const res = await POST(req(new File([csv], 'בדוי.csv', { type: 'text/csv' })))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fileName).toBe('בדוי.csv')
    expect(body.format).toBe('csv')
    expect(body.account).toEqual({ id: 'acct_leumi', kind: 'BANK', provider: 'leumi', displayName: 'בנק לאומי' })
    expect(body.importSupported).toBe(true)
    expect(body.sheets[0].rows).toHaveLength(MAX_PREVIEW_ROWS)
    expect(body.sheets[0].rowCount).toBe(MAX_PREVIEW_ROWS + 6)
    expect(body.sheets[0].omittedRowCount).toBe(6)
  })

  it('flags accounts whose provider cannot be imported yet', async () => {
    const res = await POST(req(new File(['a,b\n1,2'], 'x.csv'), 'acct_test_other'))
    expect(res.status).toBe(200)
    expect((await res.json()).importSupported).toBe(false)
  })

  it('400 when no file or no account is sent', async () => {
    expect((await POST(req())).status).toBe(400)
    expect((await POST(req(new File(['a'], 'a.csv'), null))).status).toBe(400)
  })

  it('404 for an unknown account', async () => {
    expect((await POST(req(new File(['a'], 'a.csv'), 'acct_nope'))).status).toBe(404)
  })

  it('413 when the file is too large', async () => {
    const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.csv')
    expect((await POST(req(big))).status).toBe(413)
  })

  it('422 with an error code for unsupported files', async () => {
    const res = await POST(req(new File([new Uint8Array([0, 1, 2, 3, 0])], 'x.bin')))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('UNSUPPORTED_FORMAT')
    expect(typeof body.error).toBe('string')
  })

  it('is read-only', async () => {
    await POST(req(new File(['a,b\n1,2'], 'x.csv')))
    expect(db.query(`SELECT COUNT(*) AS n FROM "UploadHistory"`)).toEqual([{ n: 0 }])
  })
})
