import { describe, expect, it } from 'vitest'
import { changingFiles, cleanPlan, confirmedFiles, needsDialog, parseConfirm, type UpdatePlan } from '../compose'

const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)

const plan = (files: UpdatePlan['files'], extra: Partial<UpdatePlan> = {}): UpdatePlan => ({ version: '9.2.0', applicable: true, files, needsApproval: false, approvers: false, step: true, ...extra })

describe('cleanPlan', () => {
  it('keeps the known fields of known files and drops the rest', () => {
    const p = cleanPlan({
      version: '9.2.0',
      applicable: true,
      files: [
        { name: 'docker-compose.yml', action: 'replace', diff: '-a\n+b', truncated: true, sha256: H1, extra: 1 },
        { name: 'docker-compose.egress.yml', action: 'skip' },
        { name: '.env', action: 'replace' },
        { name: 'docker-compose.yml', action: 'delete' },
        { name: 'docker-compose.yml', action: 'create', sha256: 'not-a-hash' },
      ],
      needsApproval: true,
      approvers: false,
      step: true,
      leak: 'x',
    })
    expect(p).toEqual({
      version: '9.2.0',
      applicable: true,
      files: [
        { name: 'docker-compose.yml', action: 'replace', diff: '-a\n+b', truncated: true, sha256: H1 },
        { name: 'docker-compose.egress.yml', action: 'skip' },
        { name: 'docker-compose.yml', action: 'create' },
      ],
      needsApproval: true,
      approvers: false,
      step: true,
    })
  })

  it('is null for anything that is not a plan; not applicable keeps its reason', () => {
    for (const bad of [null, 'x', 1, {}, { version: '9.2.0' }, { files: [] }]) expect(cleanPlan(bad)).toBeNull()
    expect(cleanPlan({ version: '9.2.0', applicable: false, reason: 'CUSTOM_TAG', files: [], needsApproval: false, approvers: false })).toMatchObject({ applicable: false, reason: 'CUSTOM_TAG', step: false })
  })
})

describe('what the dialog needs', () => {
  const replace = { name: 'docker-compose.yml', action: 'replace' as const, sha256: H1, diff: 'x' }
  const create = { name: 'docker-compose.egress.yml', action: 'create' as const, sha256: H2, diff: 'x' }
  const edited = { name: 'docker-compose.egress.yml', action: 'edited' as const, sha256: H2, diff: 'x' }
  const same = { name: 'docker-compose.yml', action: 'same' as const, sha256: H1 }

  it('shows for a replaced, created or edited file, not for same or skip, not when it does not apply', () => {
    expect(needsDialog(plan([replace]))).toBe(true)
    expect(needsDialog(plan([same, create]))).toBe(true)
    expect(needsDialog(plan([same, edited]))).toBe(true)
    expect(needsDialog(plan([same, { name: 'docker-compose.egress.yml', action: 'skip' }]))).toBe(false)
    expect(needsDialog(plan([], { applicable: false, reason: 'CUSTOM_TAG' }))).toBe(false)
  })

  it('the confirmation is the hashes of the replaced and created files only', () => {
    expect(changingFiles(plan([replace, edited])).map(f => f.name)).toEqual(['docker-compose.yml'])
    expect(confirmedFiles(plan([replace, create, same]))).toEqual({ 'docker-compose.yml': H1, 'docker-compose.egress.yml': H2 })
    expect(confirmedFiles(plan([edited]))).toEqual({})
  })
})

describe('parseConfirm', () => {
  it('accepts hashes of managed files with a passkey answer or a password for a flow', () => {
    expect(parseConfirm({ files: { 'docker-compose.yml': H1 } })).toEqual({ files: { 'docker-compose.yml': H1 } })
    expect(parseConfirm({ files: { 'docker-compose.yml': H1 }, approval: { response: { id: 'x' }, flowId: 'ignored' } })).toEqual({ files: { 'docker-compose.yml': H1 }, approval: { response: { id: 'x' } } })
    expect(parseConfirm({ files: { 'docker-compose.yml': H1 }, approval: { flowId: 'f', password: 'fake password value' } })).toEqual({
      files: { 'docker-compose.yml': H1 },
      approval: { flowId: 'f', password: 'fake password value' },
    })
  })

  it('refuses anything else', () => {
    for (const bad of [null, 'x', [], {}, { files: [] }, { files: { x: H1 } }, { files: { 'docker-compose.yml': 'nope' } }, { files: { 'docker-compose.yml': H1 }, approval: { password: 'x' } }, { files: { 'docker-compose.yml': H1 }, approval: { flowId: 'f', password: '' } }, { files: { 'docker-compose.yml': H1 }, approval: { flowId: 'f', password: 'x'.repeat(501) } }]) {
      expect(parseConfirm(bad)).toBeNull()
    }
  })
})
