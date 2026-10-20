import { listAccounts } from '@/lib/db/accounts'
import { getMissingStatements } from '@/lib/db/missing-statements'
import { UploadPageClient } from '@/components/upload/upload-page-client'

export const dynamic = 'force-dynamic'

export default async function UploadPage() {
  const [accounts, missing] = await Promise.all([listAccounts(), getMissingStatements()])
  const missingById = new Map(missing.map(m => [m.accountId, m.months]))
  return (
    <UploadPageClient
      accounts={accounts.map(a => ({
        id: a.id,
        kind: a.kind,
        provider: a.provider,
        displayName: a.displayName,
        cardLastFour: a.cardLastFour,
        cardNetwork: a.cardNetwork,
        missingMonths: missingById.get(a.id) ?? [],
      }))}
    />
  )
}
