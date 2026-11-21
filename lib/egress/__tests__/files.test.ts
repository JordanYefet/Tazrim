import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanApprovers, readChanges, readExtraDomains } from '../files'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-dir-'))
  process.env.TAZRIM_EGRESS_DIR = dir
})
afterEach(() => {
  delete process.env.TAZRIM_EGRESS_DIR
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the mounted egress files', () => {
  it('missing files are empty lists', () => {
    expect(readExtraDomains()).toEqual([])
    expect(readChanges()).toEqual([])
  })
  it('approvers never carry their public key to the browser', () => {
    const [a] = cleanApprovers([{ id: 'abc', name: 'Phone', publicKey: 'SECRETISH', alg: -7, rpId: 'tazrim.test', origin: 'https://tazrim.test', createdAt: '2030-01-01T00:00:00Z' }])
    expect(a).toEqual({ id: 'abc', name: 'Phone', rpId: 'tazrim.test', createdAt: '2030-01-01T00:00:00Z', kind: 'passkey' })
    expect(JSON.stringify(a)).not.toContain('SECRETISH')
  })
  it('extras keep their fields; junk rows are dropped', () => {
    fs.writeFileSync(path.join(dir, 'extra-domains.json'), JSON.stringify([{ domain: '.shop.example.test', note: 'n', addedAt: '2030-01-02', approver: 'Phone' }, 7, { nope: 1 }]))
    expect(readExtraDomains()).toEqual([{ domain: '.shop.example.test', note: 'n', addedAt: '2030-01-02', approver: 'Phone' }])
  })
  it('the change log: newest first, bad lines and unknown actions skipped, capped', () => {
    const rows = Array.from({ length: 60 }, (_, i) => JSON.stringify({ at: `2030-01-01T00:${String(i).padStart(2, '0')}:00Z`, action: 'add-domain', detail: `d${i}.example.test`, approver: 'Phone' }))
    rows.splice(3, 0, '{broken', JSON.stringify({ at: 'x', action: 'format-disk', detail: '', approver: '' }))
    fs.writeFileSync(path.join(dir, 'changes.jsonl'), rows.join('\n') + '\n')
    const changes = readChanges(50)
    expect(changes).toHaveLength(50)
    expect(changes[0].detail).toBe('d59.example.test')
    expect(changes.every(c => c.action === 'add-domain')).toBe(true)
  })
})
