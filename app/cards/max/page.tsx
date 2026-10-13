import { redirect } from 'next/navigation'
import { getDefaultAccount, PROVIDERS } from '@/lib/db/accounts'
import { legacyAccountRedirect, type QueryInput } from '@/lib/accounts/routes'

/**
 * Old MAX URL: the default MAX card's page, every param kept. This static
 * segment wins over /cards/[accountId], so "max" never reaches it as an id.
 */
export default async function LegacyMaxPage({ searchParams }: { searchParams: Promise<QueryInput> }) {
  const account = await getDefaultAccount('CREDIT_CARD', PROVIDERS.MAX)
  redirect(legacyAccountRedirect('CREDIT_CARD', account?.id, await searchParams))
}
