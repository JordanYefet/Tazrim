import { redirect } from 'next/navigation'
import { getDefaultAccount } from '@/lib/db/accounts'
import { legacyAccountRedirect, type QueryInput } from '@/lib/accounts/routes'

/** Old single-bank URL: the default bank account's page, every param kept. */
export default async function LegacyBankPage({ searchParams }: { searchParams: Promise<QueryInput> }) {
  const account = await getDefaultAccount('BANK')
  redirect(legacyAccountRedirect('BANK', account?.id, await searchParams))
}
