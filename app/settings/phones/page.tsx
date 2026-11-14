import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { PhonesSettings } from '@/components/settings/phones-settings'
import { getInstallView } from '@/lib/install/config'
import { getNetworkInfo } from '@/lib/install/network'
import { isReadOnly } from '@/lib/read-only'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'טלפונים וטאבלטים · תזרים' }

/** Settings → Phones and tablets (ENG-122). Not in the read-only demo. */
export default async function PhonesPage() {
  if (isReadOnly()) redirect('/settings')
  const [view, network] = await Promise.all([getInstallView(), getNetworkInfo()])
  return (
    <SettingsSection title="טלפונים וטאבלטים" description="פתיחה של תזרים מטלפון או מטאבלט ברשת ה-Wi-Fi של הבית.">
      <PhonesSettings initial={view} network={network} />
    </SettingsSection>
  )
}
