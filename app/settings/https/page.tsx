import { redirect } from 'next/navigation'
import { networkHref } from '@/lib/settings/network-redirect'

/** The former Settings → HTTPS and passkeys on the phone page, now a section of /settings/network */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(networkHref('https', await searchParams))
}
