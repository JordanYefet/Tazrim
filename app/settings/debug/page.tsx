import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { DebugSettings } from '@/components/settings/debug-settings'
import { isAuthRequired } from '@/lib/auth/config'
import { mayUseLogs } from '@/lib/log/access'
import { getShowBrowser, inDocker } from '@/lib/log/browser-flag'
import { isReadOnly } from '@/lib/read-only'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'דיבאג · תזרים' }

/** Settings → Debug (ENG-104): the log window and the sync browser. Not in the read-only demo. */
export default async function DebugPage() {
  if (isReadOnly()) redirect('/settings')
  const allowed = mayUseLogs(await headers())
  return (
    <SettingsSection>
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">דיבאג</h1>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.8125rem] text-muted-foreground">{isAuthRequired() ? 'רק למי שמחובר' : 'רק מהמחשב הזה'}</span>
        </div>
        <p className="max-w-[40rem] text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
          כשמשהו לא עובד, החלון מראה מה קרה: מעברים בין דפים, בקשות לשרת ושלבי הסנכרון. הלוגים נשמרים רק בזיכרון של השרת (500 השורות האחרונות) ונמחקים בהפעלה מחדש.
        </p>
      </div>
      {allowed ? (
        <DebugSettings inDocker={inDocker()} initialShowBrowser={getShowBrowser()} />
      ) : (
        <p className="surface rounded-2xl p-5 text-sm text-muted-foreground text-pretty">
          הדיבאג זמין רק מהמחשב שהאפליקציה רצה עליו, כי הוא מראה מה השרת עושה ומשנה את דפדפן הסנכרון. פותחים את האפליקציה מהמחשב הזה, או מפעילים כניסה עם מפתח, ואז אפשר להפעיל אותו מכל מכשיר.
        </p>
      )}
    </SettingsSection>
  )
}
