import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogsPage } from '@/components/logs/logs-page'
import { mayUseLogs } from '@/lib/log/access'
import { isReadOnly } from '@/lib/read-only'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'לוגים · תזרים' }

/** /logs (ENG-104): not in the nav, opened from the log window and Settings → Debug. Same access as the bank sync. */
export default async function Page() {
  if (isReadOnly()) redirect('/settings')
  if (!mayUseLogs(await headers())) {
    return (
      <div className="page-in mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">לוגים</h1>
        <p className="text-sm text-muted-foreground text-pretty">הלוגים זמינים רק מהמחשב שהאפליקציה רצה עליו, או אחרי כניסה לחשבון.</p>
        <Link href="/settings" className="text-sm font-medium text-primary">חזרה להגדרות</Link>
      </div>
    )
  }
  return <LogsPage />
}
