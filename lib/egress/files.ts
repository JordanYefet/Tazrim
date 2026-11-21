/**
 * The updater's state as files in egress/, which the app mounts read-only (ENG-133). Public data
 * only (domains, public keys, the change log): read here when the updater doesn't answer.
 */
import fs from 'node:fs'
import { egressFile } from './config'
import type { Approver, ChangeAction, EgressChange, ExtraDomain } from './types'

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '')

function readJson(name: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(egressFile(name), 'utf8'))
  } catch {
    return null
  }
}

export function cleanExtras(v: unknown): ExtraDomain[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && typeof (d as { domain?: unknown }).domain === 'string')
    .map(d => ({ domain: str(d.domain, 253), note: str(d.note), addedAt: str(d.addedAt, 40), approver: str(d.approver, 80) }))
}

/** Never the key or the password hash: the browser needs only who is registered */
export function cleanApprovers(v: unknown): Approver[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof (a as { id?: unknown }).id === 'string')
    .map(a => ({ id: str(a.id, 400), name: str(a.name, 80), rpId: str(a.rpId, 253), createdAt: str(a.createdAt, 40), kind: a.kind === 'password' ? ('password' as const) : ('passkey' as const) }))
}

const ACTIONS: readonly string[] = ['add-domain', 'remove-domain', 'turn-on', 'turn-off', 'add-approver', 'remove-approver']

export function cleanChanges(v: unknown): EgressChange[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && ACTIONS.includes(String((c as { action?: unknown }).action)))
    .map(c => ({ at: str(c.at, 40), action: c.action as ChangeAction, detail: str(c.detail), approver: str(c.approver, 80) }))
}

export const readExtraDomains = (): ExtraDomain[] => cleanExtras(readJson('extra-domains.json'))
export const readApprovers = (): Approver[] => cleanApprovers(readJson('approvers.json'))

/** The last `limit` lines of changes.jsonl, newest first */
export function readChanges(limit = 50): EgressChange[] {
  let text: string
  try {
    text = fs.readFileSync(egressFile('changes.jsonl'), 'utf8')
  } catch {
    return []
  }
  const rows: unknown[] = []
  for (const line of text.split('\n').slice(-limit * 2)) {
    try {
      if (line.trim()) rows.push(JSON.parse(line))
    } catch {}
  }
  return cleanChanges(rows).slice(-limit).reverse()
}
