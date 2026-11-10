import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { VaultSettings } from '@/components/vault/vault-settings'
import { isAuthRequired } from '@/lib/auth/config'

export const dynamic = 'force-dynamic'

/** Settings → the vault (ENG-90); only with the login on, since passkeys open it */
export default async function VaultPage() {
  if (!isAuthRequired()) redirect('/settings')
  return (
    <SettingsSection>
      <VaultSettings />
    </SettingsSection>
  )
}
