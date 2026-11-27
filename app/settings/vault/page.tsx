import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { VaultSettings } from '@/components/vault/vault-settings'
import { SelectSetting } from '@/components/settings/app-setting-controls'
import { getAppSettingsView } from '@/lib/settings/app-settings'
import { isAuthRequired } from '@/lib/auth/config'
import { viewerIsAdmin } from '@/lib/auth/http'
import { AdminOnly } from '@/components/settings/admin-only'

export const dynamic = 'force-dynamic'

/** Settings → the vault (ENG-90); only with the login on, since passkeys open it */
export default async function VaultPage() {
  if (!isAuthRequired()) redirect('/settings')
  const [{ vaultIdleMinutes }, admin] = await Promise.all([getAppSettingsView(), viewerIsAdmin()])
  const options = [5, 10, 15, 30, 60, 120, 240].map(m => ({ value: String(m), label: m === 60 ? 'שעה' : m === 120 ? 'שעתיים' : m === 240 ? '4 שעות' : `${m} דקות` }))
  return (
    <SettingsSection>
      <VaultSettings isAdmin={admin} />
      <AdminOnly admin={admin}>
        <SelectSetting
          name="vaultIdleMinutes"
          title="נעילה אחרי חוסר שימוש"
          help="הכספת ננעלת מעצמה אחרי הזמן הזה בלי שימוש, ואז צריך לפתוח אותה שוב עם Face ID או Touch ID. השינוי חל מיד על כספת פתוחה."
          label="דקות עד נעילה"
          value={String(vaultIdleMinutes.value)}
          locked={vaultIdleMinutes.locked}
          options={options}
        />
      </AdminOnly>
    </SettingsSection>
  )
}
