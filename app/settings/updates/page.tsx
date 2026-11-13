import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import pkg from '@/package.json'
import { SettingsSection } from '@/components/settings/settings-section'
import { VersionCard } from '@/components/updates/version-card'
import { isReadOnly } from '@/lib/read-only'
import { getUpdateView } from '@/lib/updates/state'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'עדכונים · תזרים' }

/**
 * Settings → Updates (ENG-98): the version card, with the check, the update and the roll back.
 * Not in the read-only demo; a failing read leaves the plain version line.
 */
export default async function UpdatesPage() {
  if (isReadOnly()) redirect('/settings')
  const update = await getUpdateView().catch(() => null)
  return (
    <SettingsSection title="עדכונים" description="הגרסה המותקנת, בדיקה אם יצאה גרסה חדשה ועדכון אליה.">
      {update ? (
        <VersionCard initial={update} />
      ) : (
        <p className="rounded-xl surface p-5 text-sm text-muted-foreground">
          גרסה <span dir="ltr" className="tabular-nums">{pkg.version}</span>
        </p>
      )}
    </SettingsSection>
  )
}
