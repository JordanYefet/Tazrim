'use client'

import { Building2, CreditCard, LineChart, PiggyBank, Plus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface UploadAccount {
  id: string
  kind: 'BANK' | 'CREDIT_CARD' | 'TRADING' | 'PENSION'
  provider: string
  displayName: string
  cardLastFour: string | null
}

const KIND_GROUPS: { kind: UploadAccount['kind']; label: string; icon: LucideIcon }[] = [
  { kind: 'BANK', label: 'חשבונות בנק', icon: Building2 },
  { kind: 'CREDIT_CARD', label: 'כרטיסי אשראי', icon: CreditCard },
  { kind: 'TRADING', label: 'מסחר', icon: LineChart },
  { kind: 'PENSION', label: 'פנסיה וחיסכון', icon: PiggyBank },
]

const PROVIDER_LABELS: Record<string, string> = { leumi: 'לאומי', max: 'מקס', hitech: 'הייטקזון' }

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

export function AccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: UploadAccount[]
  value: string | null
  onChange: (id: string) => void
}) {
  const groups = KIND_GROUPS.map(g => ({ ...g, accounts: accounts.filter(a => a.kind === g.kind) })).filter(
    g => g.accounts.length
  )

  return (
    <div className="space-y-4" role="radiogroup" aria-label="חשבון יעד">
      {groups.length === 0 && <p className="text-sm text-muted-foreground">אין חשבונות פעילים</p>}
      {groups.map(group => (
        <div key={group.kind} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {group.accounts.map(account => {
              const selected = account.id === value
              const Icon = group.icon
              return (
                <label
                  key={account.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  )}
                >
                  <input
                    type="radio"
                    name="upload-account"
                    value={account.id}
                    checked={selected}
                    onChange={() => onChange(account.id)}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      'w-9 h-9 shrink-0 rounded-lg flex items-center justify-center',
                      selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{account.displayName}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {providerLabel(account.provider)}
                      {account.cardLastFour && <> · <span dir="ltr">•••• {account.cardLastFour}</span></>}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'w-4 h-4 shrink-0 rounded-full border-2 transition-colors',
                      selected ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_hsl(var(--card))]' : 'border-border'
                    )}
                  />
                </label>
              )
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled
        title="יצירת חשבונות תתווסף בקרוב"
        className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-dashed px-3 py-2 opacity-60 cursor-not-allowed"
      >
        <Plus className="h-4 w-4" />
        חשבון חדש
        <span className="text-xs rounded bg-muted px-1.5 py-0.5">בקרוב</span>
      </button>
    </div>
  )
}
