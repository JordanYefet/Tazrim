import { listAccounts } from '@/lib/db/accounts'
import { UploadPageClient } from '@/components/upload/upload-page-client'

export const dynamic = 'force-dynamic'

export default async function UploadPage() {
  const accounts = (await listAccounts()).map(a => ({
    id: a.id,
    kind: a.kind,
    provider: a.provider,
    displayName: a.displayName,
    cardLastFour: a.cardLastFour,
  }))
  return <UploadPageClient accounts={accounts} />
}
