import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { HttpsSettings } from '@/components/settings/https-settings'
import { getInstallView } from '@/lib/install/config'
import { getNetworkInfo } from '@/lib/install/network'
import { isReadOnly } from '@/lib/read-only'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'HTTPS ומפתחות בטלפון · תזרים' }

/** Settings → HTTPS and passkeys on the phone (ENG-123). Not in the read-only demo. */
export default async function HttpsPage() {
  if (isReadOnly()) redirect('/settings')
  const [view, network] = await Promise.all([getInstallView(), getNetworkInfo()])
  return (
    <SettingsSection title="HTTPS ומפתחות בטלפון" description="חיבור מוצפן ושם קבוע כמו tazrim.internal, כדי להיכנס מהטלפון עם Face ID או טביעת אצבע.">
      <HttpsSettings initial={view} network={network} />
    </SettingsSection>
  )
}
