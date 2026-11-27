import { DangerZone } from '@/components/settings/danger-zone'
import { SettingsSection } from '@/components/settings/settings-section'
import { isAuthRequired } from '@/lib/auth/config'
import { AdminOnly } from '@/components/settings/admin-only'
import { currentSession, viewerIsAdmin } from '@/lib/auth/http'
import { hasOwnPassword } from '@/lib/auth/household'

export const dynamic = 'force-dynamic'

export default async function DangerPage() {
  const session = isAuthRequired() ? await currentSession() : null
  const admin = await viewerIsAdmin()
  return (
    <SettingsSection>
      <AdminOnly admin={admin}>
        <DangerZone confirmIdentity={isAuthRequired()} hasPassword={session ? await hasOwnPassword(session.personId) : false} />
      </AdminOnly>
    </SettingsSection>
  )
}
