import { describe, expect, it } from 'vitest'
import { chromiumArgs, safeReason } from '../scrape'

// Made-up card digits and messages only.
describe('safeReason', () => {
  it('masks every run of three or more digits, so no card, account or ID number reaches the log', () => {
    expect(safeReason('failed to fetch transactions for card 1234. Message: x')).toBe('failed to fetch transactions for card ###. Message: x')
    expect(safeReason('account 000-123456/00 amount 99')).toBe('account ###-###/00 amount 99')
  })
  it('flattens whitespace and cuts long text', () => {
    expect(safeReason('a\n\n  b')).toBe('a b')
    expect(safeReason('x'.repeat(500))).toHaveLength(300)
    expect(safeReason(undefined)).toBe('')
  })
})

describe('chromiumArgs', () => {
  it('splits the flags on whitespace and drops empties', () => {
    expect(chromiumArgs('--no-sandbox  --disable-dev-shm-usage ')).toEqual(['--no-sandbox', '--disable-dev-shm-usage'])
    expect(chromiumArgs('')).toEqual([])
    expect(chromiumArgs(undefined)).toEqual([])
  })
})
