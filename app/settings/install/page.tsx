import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { InstallSettings } from '@/components/install/install-settings'
import { getInstallView } from '@/lib/install/config'
import { isReadOnly } from '@/lib/read-only'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'התקנה · תזרים' }

/** Settings → Installation (ENG-121): addresses and ports. Not in the read-only demo. */
export default async function InstallPage() {
  if (isReadOnly()) redirect('/settings')
  const view = await getInstallView()
  return (
    <SettingsSection title="התקנה" description="הכתובות של תזרים והפורטים שהוא פתוח בהם.">
      <InstallSettings initial={view} />
    </SettingsSection>
  )
}
