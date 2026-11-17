import { redirect } from 'next/navigation'
import { networkHref } from '@/lib/settings/network-redirect'

/** The former Settings → Installation page, now a section of /settings/network */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(networkHref('advanced', await searchParams))
}
