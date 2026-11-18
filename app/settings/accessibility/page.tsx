import { AccessibilitySettings } from '@/components/a11y/accessibility-settings'
import { SettingsSection } from '@/components/settings/settings-section'

export default function AccessibilityPage() {
  return (
    <SettingsSection wide title="נגישות" description="ההגדרות האלה שלך בלבד. הן נשמרות בחשבון שלך וחלות בכל מכשיר שבו נכנסת.">
      <AccessibilitySettings />
    </SettingsSection>
  )
}
