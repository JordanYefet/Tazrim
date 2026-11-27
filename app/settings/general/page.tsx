import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { GeneralSettings } from '@/components/settings/general-settings'
import { AdminOnly } from '@/components/settings/admin-only'
import { viewerIsAdmin } from '@/lib/auth/http'
import { isReadOnly } from '@/lib/read-only'
import { getAppSettingsView } from '@/lib/settings/app-settings'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'כללי · תזרים' }

/** Settings → General (ENG-120). Not in the read-only demo. */
export default async function GeneralPage() {
  if (isReadOnly()) redirect('/settings')
  const [view, admin] = await Promise.all([getAppSettingsView(), viewerIsAdmin()])
  return (
    <SettingsSection title="כללי" description="אזור הזמן וסנכרון הבנקים. כל שינוי נכנס לתוקף מיד.">
      <AdminOnly admin={admin}>
        <GeneralSettings view={view} />
      </AdminOnly>
    </SettingsSection>
  )
}
