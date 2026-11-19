import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { LogsFullscreen } from '@/components/logs/logs-fullscreen'
import { mayUseLogs } from '@/lib/log/access'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'לוגים במסך מלא · תזרים' }

/**
 * The log on the whole screen (ENG-104). A bare page (lib/auth/config.ts isBarePath): the root layout
 * renders it with no sidebar, header or tab bar. Not allowed here: back to /logs, which explains.
 */
export default async function Page() {
  if (!mayUseLogs(await headers())) redirect('/logs')
  return <LogsFullscreen />
}
