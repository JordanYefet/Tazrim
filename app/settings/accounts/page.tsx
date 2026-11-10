import { listAccountsWithCounts } from '@/lib/db/accounts'
import { getCardPayerEvidence, localToday } from '@/lib/db/card-payers'
import { isImportSupported } from '@/lib/upload/import'
import { AccountsManager, type ManagedAccount } from '@/components/accounts/accounts-manager'
import { parseNewKind } from '@/components/accounts/account-kinds'
import { SettingsSection } from '@/components/settings/settings-section'
import { listImportProfiles } from '@/lib/db/import-profiles'
import { BANK_COLORS, CARD_COLORS } from '@/lib/nav/state'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db/client'
import { isAuthRequired } from '@/lib/auth/config'
import { isReadOnly } from '@/lib/read-only'
import { maySync } from '@/lib/sync/access'
import { matchSignIns } from '@/lib/accounts/sign-ins'
import type { SyncReadiness } from '@/components/accounts/add-account-sheet'
import type { AccountSource } from '@/components/accounts/data-source'

export const dynamic = 'force-dynamic'

/** Account management (the old /accounts page); ?new=bank|card opens the add form */
export default async function AccountsSettingsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: newParam } = await searchParams
  // The colour each account has by position (dots, charts), as in the nav: the brand default's fallback
  const position = { BANK: 0, CREDIT_CARD: 0 } as Record<string, number>
  const positionColor = (kind: string, archived: boolean) => {
    const colors = kind === 'BANK' ? BANK_COLORS : kind === 'CREDIT_CARD' ? CARD_COLORS : null
    if (!colors || archived) return undefined
    return colors[position[kind]++ % colors.length]
  }
  const now = new Date()
  const [profileRows, rows, payerEvidence, signIns, links] = await Promise.all([
    listImportProfiles(),
    listAccountsWithCounts(),
    getCardPayerEvidence(now),
    // Names only: the sealed fields never leave the vault
    prisma.bankCredential.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, company: true, label: true, accountId: true, updatedAt: true } }),
    prisma.syncLink.findMany({ orderBy: { createdAt: 'asc' }, select: { company: true, accountId: true, ignored: true, lastSyncedAt: true } }),
  ])
  const signInOf = matchSignIns(
    signIns.map(s => ({ ...s, updatedAt: s.updatedAt.toISOString() })),
    links.map(l => ({ ...l, lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null }))
  )
  // An account can't sync without the vault, and the vault needs the passkey login
  const sync: SyncReadiness = isReadOnly()
    ? { available: false, reason: 'לא זמין בגרסת ההדגמה' }
    : !isAuthRequired()
      ? { available: false, reason: 'צריך כניסה עם מפתח (Face ID או Touch ID), כי פרטי הכניסה נשמרים בכספת' }
      : maySync(await headers())
        ? { available: true, reason: null }
        : { available: false, reason: 'לא זמין מהמכשיר הזה' }
  const ownProfile = (a: { id: string; kind: string }) => {
    const p = profileRows.find(p => p.accountId === a.id && p.accountKind === a.kind)
    return p ? { id: p.id, name: p.name } : null
  }
  const colors = new Map<string, string | undefined>()
  const base = rows.map(a => {
    const c = positionColor(a.kind, a.archived)
    colors.set(a.id, c)
    return { a, c }
  })
  const sourceOf = (id: string): AccountSource | null => {
    const s = signInOf.get(id)
    if (!s) return null
    return {
      credentialId: s.credentialId,
      company: s.company,
      updatedAt: s.updatedAt,
      lastSyncedAt: s.lastSyncedAt,
      shares: s.accountIds
        .filter(other => other !== id)
        .flatMap(other => {
          const o = rows.find(r => r.id === other)
          return o && (o.kind === 'BANK' || o.kind === 'CREDIT_CARD')
            ? [{ id: o.id, kind: o.kind, provider: o.provider, displayName: o.displayName, cardLastFour: o.cardLastFour, color: o.color, positionColor: colors.get(o.id) }]
            : []
        }),
    }
  }
  const accounts: ManagedAccount[] = base.map(({ a, c }) => ({
    id: a.id,
    kind: a.kind,
    provider: a.provider,
    displayName: a.displayName,
    cardLastFour: a.cardLastFour,
    cardNetwork: a.cardNetwork,
    color: a.color,
    archived: a.archived,
    transactionCount: a.transactionCount,
    uploadCount: a.counts.uploads,
    importSupported: isImportSupported(a),
    importProfile: ownProfile(a),
    positionColor: c,
    payerAccountId: a.payerAccountId,
    source: sourceOf(a.id),
  }))

  return (
    <SettingsSection>
      <AccountsManager accounts={accounts} initialNewKind={parseNewKind(newParam)} payerEvidence={payerEvidence} today={localToday(now)} sync={sync} />
    </SettingsSection>
  )
}
