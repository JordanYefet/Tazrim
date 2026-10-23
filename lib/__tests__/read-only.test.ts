import { afterEach, describe, expect, it, vi } from 'vitest'
import { isReadOnly, isWriteBlocked } from '../read-only'

describe('isWriteBlocked', () => {
  it('lets reads through', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) expect(isWriteBlocked(method, '/api/accounts')).toBe(false)
  })

  it('blocks every write to the API', () => {
    expect(isWriteBlocked('POST', '/api/upload')).toBe(true)
    expect(isWriteBlocked('PATCH', '/api/bank/transactions/abc')).toBe(true)
    expect(isWriteBlocked('PUT', '/api/categories/1')).toBe(true)
    expect(isWriteBlocked('DELETE', '/api/accounts/abc')).toBe(true)
    expect(isWriteBlocked('post', '/api/data/delete-all')).toBe(true)
  })

  it('lets the previews through: they only read', () => {
    expect(isWriteBlocked('POST', '/api/upload/preview')).toBe(false)
    expect(isWriteBlocked('POST', '/api/recurring/manual/preview')).toBe(false)
    expect(isWriteBlocked('POST', '/api/upload/preview/')).toBe(false)
  })

  it('does not treat a lookalike path as a preview', () => {
    expect(isWriteBlocked('POST', '/api/upload/preview-and-save')).toBe(true)
    expect(isWriteBlocked('POST', '/api/upload/x/preview')).toBe(true)
  })

  it('leaves non-API paths alone', () => {
    expect(isWriteBlocked('POST', '/settings')).toBe(false)
  })
})

describe('isReadOnly', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is on only for TAZRIM_READ_ONLY=1 or true', () => {
    vi.stubEnv('TAZRIM_READ_ONLY', '1')
    expect(isReadOnly()).toBe(true)
    vi.stubEnv('TAZRIM_READ_ONLY', 'true')
    expect(isReadOnly()).toBe(true)
    vi.stubEnv('TAZRIM_READ_ONLY', '0')
    expect(isReadOnly()).toBe(false)
    vi.stubEnv('TAZRIM_READ_ONLY', '')
    expect(isReadOnly()).toBe(false)
  })
})
