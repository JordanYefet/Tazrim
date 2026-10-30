import { redirect } from 'next/navigation'
import { analysisHref } from '@/lib/accounts/category-links'

/** Moved: one bank account's analysis is a scope of /analysis (bank and cards together); old links keep working. */
export default async function BankCategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { accountId } = await params
  redirect(analysisHref(decodeURIComponent(accountId), await searchParams))
}
