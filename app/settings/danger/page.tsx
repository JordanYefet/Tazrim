import { DangerZone } from '@/components/settings/danger-zone'
import { SettingsSection } from '@/components/settings/settings-section'
import { isAuthRequired } from '@/lib/auth/config'
import { currentSession } from '@/lib/auth/http'
import { hasOwnPassword } from '@/lib/auth/household'

export const dynamic = 'force-dynamic'

export default async function DangerPage() {
  const session = isAuthRequired() ? await currentSession() : null
  return (
    <SettingsSection>
      <DangerZone confirmIdentity={isAuthRequired()} hasPassword={session ? await hasOwnPassword(session.personId) : false} />
    </SettingsSection>
  )
}
