import { listAccountsWithCounts } from '@/lib/db/accounts'
import { isImportSupported } from '@/lib/upload/import'
import { AccountsManager, type ManagedAccount } from '@/components/accounts/accounts-manager'
import { parseNewKind } from '@/components/accounts/account-kinds'

export const dynamic = 'force-dynamic'

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: newParam } = await searchParams
  const accounts: ManagedAccount[] = (await listAccountsWithCounts()).map(a => ({
    id: a.id,
    kind: a.kind,
    provider: a.provider,
    displayName: a.displayName,
    cardLastFour: a.cardLastFour,
    archived: a.archived,
    transactionCount: a.transactionCount,
    uploadCount: a.counts.uploads,
    importSupported: isImportSupported(a),
  }))

  return <AccountsManager accounts={accounts} initialNewKind={parseNewKind(newParam)} />
}
