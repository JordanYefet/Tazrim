import { listAccountsWithCounts } from '@/lib/db/accounts'
import { getCardPayerEvidence, localToday } from '@/lib/db/card-payers'
import { isImportSupported } from '@/lib/upload/import'
import { AccountsManager, type ManagedAccount } from '@/components/accounts/accounts-manager'
import { parseNewKind } from '@/components/accounts/account-kinds'
import { SettingsSection } from '@/components/settings/settings-section'
import { listImportProfiles } from '@/lib/db/import-profiles'
import { BANK_COLORS, CARD_COLORS } from '@/lib/nav/state'

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
  const [profileRows, rows, payerEvidence] = await Promise.all([listImportProfiles(), listAccountsWithCounts(), getCardPayerEvidence(now)])
  const ownProfile = (a: { id: string; kind: string }) => {
    const p = profileRows.find(p => p.accountId === a.id && p.accountKind === a.kind)
    return p ? { id: p.id, name: p.name } : null
  }
  const accounts: ManagedAccount[] = rows.map(a => ({
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
    positionColor: positionColor(a.kind, a.archived),
    payerAccountId: a.payerAccountId,
  }))

  return (
    <SettingsSection>
      <AccountsManager accounts={accounts} initialNewKind={parseNewKind(newParam)} payerEvidence={payerEvidence} today={localToday(now)} />
    </SettingsSection>
  )
}
