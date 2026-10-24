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

/**
 * Known providers offered in the add form, per kind. Every provider's files
 * are imported through a column mapping (lib/upload/import.ts).
 */
export const KNOWN_PROVIDERS: { key: string; label: string; kind: CreatableKindValue }[] = [
  { key: 'leumi', label: 'לאומי', kind: 'BANK' },
  { key: 'hapoalim', label: 'הפועלים', kind: 'BANK' },
  { key: 'discount', label: 'דיסקונט', kind: 'BANK' },
  { key: 'mizrahi', label: 'מזרחי טפחות', kind: 'BANK' },
  { key: 'max', label: 'מקס', kind: 'CREDIT_CARD' },
  { key: 'cal', label: 'כאל', kind: 'CREDIT_CARD' },
  { key: 'isracard', label: 'ישראכרט', kind: 'CREDIT_CARD' },
  { key: 'amex', label: 'אמריקן אקספרס', kind: 'CREDIT_CARD' },
]

/** `?new=` on /accounts: BANK / CREDIT_CARD (any case), plus the short forms bank / card. */
export function parseNewKind(value: string | undefined): CreatableKindValue | null {
  const v = value?.trim().toUpperCase()
  if (v === 'BANK') return 'BANK'
  if (v === 'CREDIT_CARD' || v === 'CARD') return 'CREDIT_CARD'
  return null
}
