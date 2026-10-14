import { redirect } from 'next/navigation'
import { settingsAccountsHref, type QueryInput } from '@/lib/accounts/routes'

/** Account management moved into /settings; old links (and ?new=) still work. */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<QueryInput> }) {
  redirect(settingsAccountsHref(await searchParams))
}
