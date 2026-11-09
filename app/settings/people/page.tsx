import { redirect } from 'next/navigation'
import { PeopleSettings } from '@/components/settings/people-settings'
import { SettingsSection } from '@/components/settings/settings-section'
import { isAuthRequired } from '@/lib/auth/config'

export const dynamic = 'force-dynamic'

/** ENG-89: only with the login on (development and the demo have no people) */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ recovered?: string; open?: string }> }) {
  if (!isAuthRequired()) redirect('/settings')
  const { recovered, open } = await searchParams
  return (
    <SettingsSection>
      <PeopleSettings recovered={recovered === '1'} open={open === 'device' || open === 'password' ? open : undefined} />
    </SettingsSection>
  )
}
