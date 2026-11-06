import { Building2, CreditCard, LineChart, PiggyBank, type LucideIcon } from 'lucide-react'
import { SYNC_COMPANIES } from '@/lib/sync/providers'

export type AccountKindValue = 'BANK' | 'CREDIT_CARD' | 'TRADING' | 'PENSION'
export type CreatableKindValue = 'BANK' | 'CREDIT_CARD'

export const KIND_META: { kind: AccountKindValue; label: string; single: string; icon: LucideIcon }[] = [
  { kind: 'BANK', label: 'חשבונות בנק', single: 'חשבון בנק', icon: Building2 },
  { kind: 'CREDIT_CARD', label: 'כרטיסי אשראי', single: 'כרטיס אשראי', icon: CreditCard },
  { kind: 'TRADING', label: 'מסחר', single: 'חשבון מסחר', icon: LineChart },
  { kind: 'PENSION', label: 'פנסיה וחיסכון', single: 'פנסיה וחיסכון', icon: PiggyBank },
]

export const CREATABLE: CreatableKindValue[] = ['BANK', 'CREDIT_CARD']

/**
 * The companies offered in the add form, per kind: the ones the sync logs in to
 * (lib/sync/providers.ts, ENG-102), so an account's provider is also the site it
 * syncs through. Anything else is added as upload only, by name. Every
 * provider's files are imported through a column mapping (lib/upload/import.ts).
 */
export const KNOWN_PROVIDERS: { key: string; label: string; kind: CreatableKindValue }[] = SYNC_COMPANIES.map(c => ({
  key: c.provider,
  label: c.label,
  kind: c.kind,
}))

/** `?new=` on /accounts: BANK / CREDIT_CARD (any case), plus the short forms bank / card. */
export function parseNewKind(value: string | undefined): CreatableKindValue | null {
  const v = value?.trim().toUpperCase()
  if (v === 'BANK') return 'BANK'
  if (v === 'CREDIT_CARD' || v === 'CARD') return 'CREDIT_CARD'
  return null
}
