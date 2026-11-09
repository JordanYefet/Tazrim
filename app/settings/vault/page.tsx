import { redirect } from 'next/navigation'
import { SettingsSection } from '@/components/settings/settings-section'
import { VaultSettings } from '@/components/vault/vault-settings'
import { isAuthRequired } from '@/lib/auth/config'
import { listAccounts } from '@/lib/db/accounts'

export const dynamic = 'force-dynamic'

/** Settings → the vault (ENG-90); only with the login on, since passkeys open it */
export default async function VaultPage() {
  if (!isAuthRequired()) redirect('/settings')
  const accounts = (await listAccounts()).map(a => ({ id: a.id, name: a.displayName, kind: a.kind }))
  return (
    <SettingsSection>
      <VaultSettings accounts={accounts} />
    </SettingsSection>
  )
}
