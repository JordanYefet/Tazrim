import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { NetworkSettings } from '@/components/settings/network-settings'
import { getInstallView } from '@/lib/install/config'
import { getNetworkInfo } from '@/lib/install/network'
import { AdminOnly } from '@/components/settings/admin-only'
import { viewerIsAdmin } from '@/lib/auth/http'
import { isReadOnly } from '@/lib/read-only'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'טלפונים ורשת · תזרים' }

/** Settings → Phones and network (ENG-121/122/123, one page). Not in the read-only demo. */
export default async function NetworkPage() {
  if (isReadOnly()) redirect('/settings')
  const [view, network, admin] = await Promise.all([getInstallView(), getNetworkInfo(), viewerIsAdmin()])
  return (
    <SettingsSection title="טלפונים ורשת" description="פתיחה של תזרים מטלפון או מטאבלט ברשת הביתית, חיבור מוצפן, והכתובות של המחשב.">
      <AdminOnly admin={admin}>
        <NetworkSettings initial={view} network={network} />
      </AdminOnly>
    </SettingsSection>
  )
}
