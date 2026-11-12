import { AccountPills } from '@/components/accounts/account-pills'

/** All banks, or one: the same account pills as ניתוח */
export function BankPicker({
  banks,
  active,
}: {
  banks: { id: string; displayName: string; provider: string; color: string | null }[]
  active: string | null
}) {
  const items = [
    { key: 'all', label: 'כל הבנקים', href: '/projection' },
    ...banks.map(b => ({
      key: b.id,
      label: b.displayName,
      href: `/projection?account=${b.id}`,
      account: { kind: 'BANK' as const, provider: b.provider, color: b.color },
    })),
  ]
  return <AccountPills data-bank-picker items={items} active={active ?? 'all'} label="בחירת בנק" />
}
