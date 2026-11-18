import { describe, expect, it } from 'vitest'
import { MASK, MAX_LENGTH, describeError, redact, redactData } from '../redact'
import { safeReason } from '@/lib/sync/scrape'

// Every value below is made up
describe('redact: secret keys', () => {
  it('masks key=value, key: value and JSON forms', () => {
    expect(redact('login password=hunter2 ok')).toBe(`login password=${MASK} ok`)
    expect(redact('userCode: ab12cd')).toBe(`userCode: ${MASK}`)
    expect(redact('{"username":"demo-user","count":3}')).toBe(`{"username":"${MASK}","count":3}`)
    expect(redact("{'otp':'123456'}")).toBe(`{'otp':'${MASK}'}`)
  })
  it('ignores key case and covers id, num, card6Digits, nationalID, token', () => {
    for (const k of ['PASSWORD', 'Id', 'num', 'card6Digits', 'nationalID', 'token', 'user']) {
      expect(redact(`${k}=abc`)).toBe(`${k}=${MASK}`)
    }
  })
  it('does not touch a key that merely ends in one', () => {
    expect(redact('pid=7 rapid: yes')).toBe('pid=7 rapid: yes')
  })
  it('leaves error codes readable', () => {
    expect(redact('code: INVALID_PASSWORD')).toBe('code: INVALID_PASSWORD')
  })
})

describe('redact: numbers', () => {
  it('masks card numbers written in groups', () => {
    expect(redact('card 1111 2222 3333 4444 used')).toBe(`card ${MASK} used`)
    expect(redact('card 1111-2222-3333-4444')).toBe(`card ${MASK}`)
    expect(redact('amex 3711 222222 11111')).toBe(`amex ${MASK}`)
  })
  it('masks runs of five or more digits', () => {
    expect(redact('account 1234567 and 99999')).toBe(`account ${MASK} and ${MASK}`)
  })
  it('keeps dates, times and short numbers', () => {
    const keep = 'GET /bank → 200 · 96ms · 2026-11-19 · 19/11/2026 · 21:42:07.112 · 4460 · 42 txns'
    expect(redact(keep)).toBe(keep)
  })
})

describe('redact: other secrets', () => {
  it('masks e-mail addresses', () => {
    expect(redact('sent to someone@example.test now')).toBe(`sent to ${MASK} now`)
  })
  it('masks Bearer tokens', () => {
    expect(redact('Authorization header Bearer abc.def-ghi_123')).toBe(`Authorization header Bearer ${MASK}`)
  })
  it('masks long hex and base64 tokens, not long words', () => {
    expect(redact('hash 0123456789abcdef0123456789abcdef0123')).toBe(`hash ${MASK}`)
    expect(redact('key QWxhZGRpbjpvcGVuIHNlc2FtZQ0123456789abcdefg=')).toBe(`key ${MASK}`)
    expect(redact('internationalizationlocalizationconfiguration')).toBe('internationalizationlocalizationconfiguration')
  })
  it('caps the length', () => {
    const out = redact('x'.repeat(2000))
    expect(out.length).toBe(MAX_LENGTH + 1)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('redactData', () => {
  it('masks secret fields whole and redacts the strings in the others', () => {
    const out = redactData({ run: 7, step: 'LOGIN', password: 'p', nested: { userCode: 'u', note: 'mail a@b.test' }, list: ['1234567'] })
    expect(out).toEqual({ run: 7, step: 'LOGIN', password: MASK, nested: { userCode: MASK, note: `mail ${MASK}` }, list: [MASK] })
  })
  it('masks huge integers but keeps counts and durations', () => {
    expect(redactData({ ms: 4460, count: 42, big: 1234567890123 })).toEqual({ ms: 4460, count: 42, big: MASK })
  })
  it('stops at a depth', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } }
    expect(JSON.stringify(redactData(deep))).toContain('…')
  })
})

describe('describeError', () => {
  it('is the name and message only, redacted, with no stack', () => {
    const e = new Error('login failed for userCode=abc on 12345678')
    const line = describeError(e)
    expect(line).toBe(`Error: login failed for userCode=${MASK} on ${MASK}`)
    expect(line).not.toContain(' at ')
  })
  it('takes a non-error', () => {
    expect(describeError('plain 1234567')).toBe(`plain ${MASK}`)
  })
})

describe('safeReason still masks 3+ digits', () => {
  it('keeps its stricter rule', () => {
    expect(safeReason('card 123 and 12 and 1234567')).toBe('card ### and 12 and ###')
    expect(safeReason('a 999 b')).toBe('a ### b')
  })
})
