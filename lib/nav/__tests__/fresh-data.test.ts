import { describe, expect, it } from 'vitest'
import { AWAY_MS, isDataWrite, staleOnReturn } from '../fresh-data'

describe('isDataWrite', () => {
  it('counts writes to the API', () => {
    expect(isDataWrite('POST', '/api/upload')).toBe(true)
    expect(isDataWrite('PATCH', '/api/cards/transactions/tx_test')).toBe(true)
    expect(isDataWrite('DELETE', '/api/categories/cat_test')).toBe(true)
  })
  it('ignores reads and the previews that only compute', () => {
    expect(isDataWrite('GET', '/api/sync')).toBe(false)
    expect(isDataWrite('POST', '/api/upload/preview')).toBe(false)
    expect(isDataWrite('POST', '/somewhere-else')).toBe(false)
  })
})

describe('staleOnReturn', () => {
  it('refreshes after a while away, not after a glance', () => {
    expect(staleOnReturn(null, 1_000_000)).toBe(false)
    expect(staleOnReturn(1_000_000, 1_000_000 + 5_000)).toBe(false)
    expect(staleOnReturn(1_000_000, 1_000_000 + AWAY_MS)).toBe(true)
  })
})
