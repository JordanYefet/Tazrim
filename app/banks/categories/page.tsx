import { redirect } from 'next/navigation'
import { analysisHref } from '@/lib/accounts/category-links'

/** Moved: every bank account's analysis is a scope of /analysis (bank and cards together); old links keep working. */
export default async function AllBanksCategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(analysisHref('bank', await searchParams))
}
