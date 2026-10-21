import type { ImportProfile } from '@prisma/client'
import { builtInLayoutFor } from './builtin-layouts'
import { parseSnapshot } from './snapshot'

/** What the UI sees of a saved profile (the mapping itself stays on the server). */
export interface ProfileView {
  id: string
  name: string
  accountKind: ImportProfile['accountKind']
  provider: string
  account: { id: string; displayName: string } | null
  updatedAt: string
  /**
   * ENG-69: the header row is stored (or can be rebuilt from the signature),
   * so the mapping opens without a file
   */
  fileless: boolean
  /** Linked to a Leumi / Max account that currently uses the built-in importer */
  idle: boolean
}

type LinkedAccount = { id: string; displayName: string; kind?: string; provider?: string; customImport?: boolean }

export function toProfileView(p: ImportProfile & { account?: LinkedAccount | null }): ProfileView {
  const a = p.account
  return {
    id: p.id,
    name: p.name,
    accountKind: p.accountKind,
    provider: p.provider,
    account: a ? { id: a.id, displayName: a.displayName } : null,
    updatedAt: p.updatedAt.toISOString(),
    fileless: parseSnapshot(p.headers) !== null || p.headerSignature.trim() !== '',
    idle: !!a && a.kind !== undefined && a.provider !== undefined && !a.customImport && builtInLayoutFor({ kind: a.kind, provider: a.provider }) !== null,
  }
}
