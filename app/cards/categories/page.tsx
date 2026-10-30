import { redirect } from 'next/navigation'
import { analysisHref } from '@/lib/accounts/category-links'

/** Moved: every card's analysis is a scope of /analysis (bank and cards together); old links keep working. */
export default async function AllCardsCategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(analysisHref('cards', await searchParams))
}
