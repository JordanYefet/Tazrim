import { describe, it, expect } from 'vitest'
import { POST } from '../route'
import { MAX_PREVIEW_ROWS, MAX_FILE_BYTES } from '@/lib/upload/preview-limits'

// All values below are made up.

function req(file?: File): Request {
  const form = new FormData()
  if (file) form.append('file', file)
  return new Request('http://localhost/api/upload/preview', { method: 'POST', body: form })
}

describe('POST /api/upload/preview', () => {
  it('returns the raw workbook preview for a CSV', async () => {
    const csv = 'תאריך,סכום\n' + Array.from({ length: MAX_PREVIEW_ROWS + 5 }, (_, i) => `2026-01-01,${i}`).join('\n')
    const res = await POST(req(new File([csv], 'בדוי.csv', { type: 'text/csv' })))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fileName).toBe('בדוי.csv')
    expect(body.format).toBe('csv')
    expect(body.sheets[0].rows).toHaveLength(MAX_PREVIEW_ROWS)
    expect(body.sheets[0].rowCount).toBe(MAX_PREVIEW_ROWS + 6)
    expect(body.sheets[0].omittedRowCount).toBe(6)
  })

  it('400 when no file is sent', async () => {
    const res = await POST(req())
    expect(res.status).toBe(400)
  })

  it('413 when the file is too large', async () => {
    const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.csv')
    const res = await POST(req(big))
    expect(res.status).toBe(413)
  })

  it('422 with an error code for unsupported files', async () => {
    const res = await POST(req(new File([new Uint8Array([0, 1, 2, 3, 0])], 'x.bin')))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('UNSUPPORTED_FORMAT')
    expect(typeof body.error).toBe('string')
  })
})
