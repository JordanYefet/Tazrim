import { ImportProfilesManager } from '@/components/settings/import-profiles-manager'
import { SettingsSection } from '@/components/settings/settings-section'
import { listImportProfiles } from '@/lib/db/import-profiles'
import { toProfileView } from '@/lib/import/profile-view'

export const dynamic = 'force-dynamic'

export default async function ImportProfilesPage() {
  const profiles = (await listImportProfiles()).map(toProfileView)
  return (
    <SettingsSection>
      <ImportProfilesManager profiles={profiles} />
    </SettingsSection>
  )
}
