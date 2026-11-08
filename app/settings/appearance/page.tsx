import { ThemeSelector } from '@/components/layout/theme-selector'
import { BackgroundSettings } from '@/components/settings/background-settings'
import { SettingsSection } from '@/components/settings/settings-section'

export default function AppearancePage() {
  return (
    <SettingsSection title="מראה">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl surface p-4 md:p-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">ערכת נושא</p>
            <p className="text-sm text-muted-foreground">בהיר, כהה, או לפי הגדרות המערכת</p>
          </div>
          <ThemeSelector />
        </div>
        <BackgroundSettings />
      </div>
    </SettingsSection>
  )
}
