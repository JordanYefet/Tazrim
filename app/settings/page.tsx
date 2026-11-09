import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { listAccounts } from '@/lib/db/accounts'
import { listImportProfiles } from '@/lib/db/import-profiles'
import { getCushion } from '@/lib/db/settings'
import { isAuthRequired } from '@/lib/auth/config'
import { status as vaultStatus } from '@/lib/vault/vault'
import { settingsAccountsHref, type QueryInput } from '@/lib/accounts/routes'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { SettingsTiles, type SettingsTile } from '@/components/settings/settings-tiles'
import { LegacySettingsHash } from '@/components/settings/legacy-settings-hash'

export const dynamic = 'force-dynamic'

const count = (n: number, one: string, many: string, none = `אין ${many}`) => (n === 0 ? none : n === 1 ? one : `${n} ${many}`)

/**
 * The Settings home: a tile per section, each with a line on its current
 * state. Old links keep working: ?new= opens the add-account form,
 * ?recovered=1 the people page, and #section anchors their page.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  if (params.new) redirect(settingsAccountsHref(params as QueryInput))
  if (params.recovered === '1') redirect('/settings/people?recovered=1')

  const auth = isAuthRequired()
  const [accounts, profiles, cushion, people, devices, vault, logins] = await Promise.all([
    listAccounts(),
    listImportProfiles(),
    getCushion(),
    auth ? prisma.person.count() : 0,
    auth ? prisma.passkey.count() : 0,
    vaultStatus(),
    auth ? prisma.bankCredential.count() : 0,
  ])
  const banks = accounts.filter(a => a.kind === 'BANK').length
  const cards = accounts.filter(a => a.kind === 'CREDIT_CARD').length

  const tiles: SettingsTile[] = [
    { href: '/settings/appearance', icon: 'appearance', title: 'מראה', summary: 'ערכת נושא, בהירה או כהה, והרקע מאחורי הדפים.' },
    {
      href: '/settings/projection',
      icon: 'projection',
      title: 'תחזית',
      summary: cushion > 0 ? `כרית ביטחון של ${formatCurrencyWhole(cushion)}.` : 'בלי כרית ביטחון. אפשר לסמן חודשים שהיתרה בהם יורדת מתחת לסכום.',
    },
    {
      href: '/settings/accounts',
      icon: 'accounts',
      title: 'חשבונות וכרטיסים',
      summary:
        banks + cards === 0
          ? 'עוד אין חשבונות. מוסיפים חשבון בנק או כרטיס אשראי.'
          : `${count(banks, 'חשבון בנק אחד', 'חשבונות בנק')} ו${count(cards, 'כרטיס אחד', 'כרטיסים')}. שמות, צבעים ומי משלם כל כרטיס.`,
    },
    {
      href: '/settings/import-profiles',
      icon: 'import-profiles',
      title: 'מיפויי ייבוא',
      summary: profiles.length ? `${count(profiles.length, 'מיפוי שמור אחד', 'מיפויים שמורים')} לקבצים שהאפליקציה לא מכירה.` : 'אין מיפויים שמורים. הם נוצרים בהעלאת קובץ שהאפליקציה לא מכירה.',
    },
    ...(auth
      ? [{
          href: '/settings/people',
          icon: 'people' as const,
          title: 'אנשים ומכשירים',
          summary: `${count(people, 'אדם אחד', 'אנשים')}, ${count(devices, 'מכשיר אחד', 'מכשירים', 'בלי מכשירים')}. הזמנות, סיסמה וקוד שחזור.`,
        },
        {
          href: '/settings/vault',
          icon: 'vault' as const,
          title: 'כספת',
          summary: !vault.exists
            ? 'פרטי הכניסה לבנקים לסנכרון, מוצפנים. עוד לא נוצרה.'
            : `${count(logins, 'פרטי כניסה שמורים לחשבון אחד', 'פרטי כניסה שמורים')}. ${vault.open ? 'פתוחה עכשיו.' : 'נעולה.'}`,
        }]
      : []),
    { href: '/about', icon: 'about', title: 'אודות', summary: 'הסיפור מאחורי תזרים, פרטיות ויצירת קשר.' },
  ]

  return (
    <div className="page-in mx-auto max-w-4xl min-w-0 space-y-6">
      <LegacySettingsHash />
      <h1 className="text-2xl font-semibold tracking-tight">הגדרות</h1>
      <SettingsTiles tiles={tiles} />
    </div>
  )
}
