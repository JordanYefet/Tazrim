import type { ImportProfile } from '@prisma/client'

/** What the UI sees of a saved profile (the mapping itself stays on the server). */
export interface ProfileView {
  id: string
  name: string
  accountKind: ImportProfile['accountKind']
  provider: string
  account: { id: string; displayName: string } | null
  updatedAt: string
}

export function toProfileView(
  p: ImportProfile & { account?: { id: string; displayName: string } | null }
): ProfileView {
  return {
    id: p.id,
    name: p.name,
    accountKind: p.accountKind,
    provider: p.provider,
    account: p.account ? { id: p.account.id, displayName: p.account.displayName } : null,
    updatedAt: p.updatedAt.toISOString(),
  }
}
