import { CushionSetting } from '@/components/settings/cushion-setting'
import { SettingsSection } from '@/components/settings/settings-section'
import { getCushion } from '@/lib/db/settings'

export const dynamic = 'force-dynamic'

export default async function ProjectionSettingsPage() {
  return (
    <SettingsSection title="תחזית">
      <CushionSetting initial={await getCushion()} />
    </SettingsSection>
  )
}
