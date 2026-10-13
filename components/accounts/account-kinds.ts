import { Building2, CreditCard, LineChart, PiggyBank, type LucideIcon } from 'lucide-react'

export type AccountKindValue = 'BANK' | 'CREDIT_CARD' | 'TRADING' | 'PENSION'
export type CreatableKindValue = 'BANK' | 'CREDIT_CARD'

export const KIND_META: { kind: AccountKindValue; label: string; single: string; icon: LucideIcon }[] = [
  { kind: 'BANK', label: 'חשבונות בנק', single: 'חשבון בנק', icon: Building2 },
  { kind: 'CREDIT_CARD', label: 'כרטיסי אשראי', single: 'כרטיס אשראי', icon: CreditCard },
  { kind: 'TRADING', label: 'מסחר', single: 'חשבון מסחר', icon: LineChart },
  { kind: 'PENSION', label: 'פנסיה וחיסכון', single: 'פנסיה וחיסכון', icon: PiggyBank },
]

export const CREATABLE: CreatableKindValue[] = ['BANK', 'CREDIT_CARD']

/** Known providers offered in the add form, and the kind their importer reads. */
export const KNOWN_PROVIDERS: { key: string; label: string; importKind: CreatableKindValue }[] = [
  { key: 'leumi', label: 'לאומי', importKind: 'BANK' },
  { key: 'max', label: 'מקס', importKind: 'CREDIT_CARD' },
]

/** `?new=` on /accounts: BANK / CREDIT_CARD (any case), plus the short forms bank / card. */
export function parseNewKind(value: string | undefined): CreatableKindValue | null {
  const v = value?.trim().toUpperCase()
  if (v === 'BANK') return 'BANK'
  if (v === 'CREDIT_CARD' || v === 'CARD') return 'CREDIT_CARD'
  return null
}

/** Mirrors lib/upload/import.ts for the add form's hint (the page passes the real flag per account). */
export function importSupportedFor(kind: CreatableKindValue, provider: string): boolean {
  return KNOWN_PROVIDERS.some(p => p.key === provider && p.importKind === kind)
}
