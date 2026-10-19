import { listAccountsWithCounts } from '@/lib/db/accounts'
import { isImportSupported } from '@/lib/upload/import'
import { mappingKindOf } from '@/lib/import/mapping'
import { AccountsManager, type ManagedAccount } from '@/components/accounts/accounts-manager'
import { parseNewKind } from '@/components/accounts/account-kinds'
import { ThemeSelector } from '@/components/layout/theme-selector'
import { ImportProfilesManager } from '@/components/settings/import-profiles-manager'
import { listImportProfiles } from '@/lib/db/import-profiles'
import { toProfileView } from '@/lib/import/profile-view'
import { DangerZone } from '@/components/settings/danger-zone'

export const dynamic = 'force-dynamic'

/** Appearance, account management (the old /accounts page, at #accounts) and saved import mappings (#import-profiles). */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: newParam } = await searchParams
  const accounts: ManagedAccount[] = (await listAccountsWithCounts()).map(a => ({
    id: a.id,
    kind: a.kind,
    provider: a.provider,
    displayName: a.displayName,
    cardLastFour: a.cardLastFour,
    archived: a.archived,
    transactionCount: a.transactionCount,
    uploadCount: a.counts.uploads,
    importSupported: isImportSupported(a) || mappingKindOf(a.kind) !== null,
  }))
  const profiles = (await listImportProfiles()).map(toProfileView)

  return (
    <div className="mx-auto max-w-3xl min-w-0 space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">הגדרות</h1>

      <section id="appearance" aria-labelledby="appearance-title" className="space-y-3">
        <h2 id="appearance-title" className="text-lg font-semibold">מראה</h2>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl surface p-4 md:p-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">ערכת נושא</p>
            <p className="text-sm text-muted-foreground">בהיר, כהה, או לפי הגדרות המערכת</p>
          </div>
          <ThemeSelector />
        </div>
      </section>

      <section id="accounts" aria-label="ניהול חשבונות">
        <AccountsManager accounts={accounts} initialNewKind={parseNewKind(newParam)} />
      </section>

      <section id="import-profiles" aria-labelledby="import-profiles-title">
        <ImportProfilesManager profiles={profiles} />
      </section>

      <section id="danger-zone" aria-labelledby="danger-zone-title">
        <DangerZone />
      </section>
    </div>
  )
}
