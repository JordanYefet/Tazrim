'use client'

import { useId, useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CREATABLE, KIND_META, KNOWN_PROVIDERS, importSupportedFor, type CreatableKindValue } from './account-kinds'
import { BankElement, PaymentCard } from './account-element'
import { CARD_NETWORKS, impliedNetwork } from '@/lib/accounts/brands'

const OTHER = '__other__'

export interface CreatedAccount {
  id: string
  displayName: string
  kind: CreatableKindValue
}

export const inputClass =
  'h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

const defaultProvider = (kind: CreatableKindValue) => KNOWN_PROVIDERS.find(p => p.kind === kind)?.key ?? OTHER

const NAME_PLACEHOLDER: Record<CreatableKindValue, string> = { CREDIT_CARD: 'הכרטיס שלי', BANK: 'החשבון שלי' }

const chip = (selected: boolean) =>
  cn(
    'inline-flex h-9 items-center rounded-lg border px-3 text-sm transition-[background-color,border-color,color,transform] duration-quick active:scale-[0.97] motion-reduce:transition-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    selected
      ? 'border-primary/50 bg-primary/10 font-medium text-primary'
      : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
  )

export function AddAccountForm({
  initialKind,
  onCreated,
  onCancel,
}: {
  initialKind: CreatableKindValue
  onCreated: (account: CreatedAccount) => void
  onCancel: () => void
}) {
  const id = useId()
  const [kind, setKind] = useState<CreatableKindValue>(initialKind)
  const [providerChoice, setProviderChoice] = useState(defaultProvider(initialKind))
  const [otherProvider, setOtherProvider] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [lastFour, setLastFour] = useState('')
  // '' = other / unknown. Follows the issuer (Amex) until the user picks one.
  const [network, setNetwork] = useState<string>(impliedNetwork(defaultProvider(initialKind)) ?? '')
  const [networkTouched, setNetworkTouched] = useState(false)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const provider = providerChoice === OTHER ? otherProvider.trim().toLowerCase() : providerChoice
  const supported = provider ? importSupportedFor(kind, provider) : true
  const lastFourInvalid = kind === 'CREDIT_CARD' && lastFour !== '' && !/^\d{4}$/.test(lastFour)

  function chooseKind(next: CreatableKindValue) {
    setKind(next)
    // Follow the kind with the provider while the user has not picked a free-text one
    if (providerChoice !== OTHER) chooseProvider(defaultProvider(next))
    setError(null)
  }

  function chooseProvider(next: string) {
    setProviderChoice(next)
    if (!networkTouched) setNetwork(impliedNetwork(next) ?? '')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving || lastFourInvalid) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          provider,
          displayName,
          cardLastFour: kind === 'CREDIT_CARD' && lastFour ? lastFour : undefined,
          cardNetwork: kind === 'CREDIT_CARD' && network ? network : undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError({ field: body.field, message: body.error ?? 'השמירה נכשלה' })
        return
      }
      onCreated({ id: body.id, displayName: body.displayName, kind })
    } catch {
      setError({ message: 'השמירה נכשלה' })
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (field: string) => (error?.field === field ? error.message : null)

  return (
    <form onSubmit={submit} className="space-y-4" aria-labelledby={`${id}-title`} noValidate>
      <h2 id={`${id}-title`} className="font-semibold">חשבון חדש</h2>

      {/* Live preview: the element the account will get, reacting to every field (ENG-56/57) */}
      <div className="flex justify-center rounded-xl bg-muted/50 px-4 py-6 sm:py-8">
        <div key={kind} className={cn('acct-enter w-full', kind === 'CREDIT_CARD' ? 'max-w-[19rem]' : 'max-w-[22rem]')}>
          {kind === 'CREDIT_CARD' ? (
            <PaymentCard
              live
              provider={provider}
              name={displayName}
              namePlaceholder={NAME_PLACEHOLDER.CREDIT_CARD}
              lastFour={lastFour}
              network={network}
            />
          ) : (
            <BankElement
              provider={provider}
              name={displayName}
              namePlaceholder={NAME_PLACEHOLDER.BANK}
              emptyText="היתרה תופיע אחרי העלאת הקובץ הראשון"
            />
          )}
        </div>
      </div>

      <div role="radiogroup" aria-label="סוג חשבון" className="inline-flex rounded-lg border bg-muted/50 p-1 gap-1">
        {CREATABLE.map(k => {
          const meta = KIND_META.find(m => m.kind === k)!
          const Icon = meta.icon
          const selected = k === kind
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => chooseKind(k)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'bg-card shadow-e1 font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {meta.single}
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-provider`} className="text-sm font-medium">ספק</label>
          <select
            id={`${id}-provider`}
            className={inputClass}
            value={providerChoice}
            onChange={e => chooseProvider(e.target.value)}
          >
            {KNOWN_PROVIDERS.filter(p => p.kind === kind).map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
            <option value={OTHER}>אחר…</option>
          </select>
        </div>

        {providerChoice === OTHER && (
          <div className="space-y-1.5">
            <label htmlFor={`${id}-other`} className="text-sm font-medium">שם הספק</label>
            <input
              id={`${id}-other`}
              className={inputClass}
              value={otherProvider}
              onChange={e => setOtherProvider(e.target.value)}
              placeholder={kind === 'BANK' ? 'לדוגמה: yahav' : 'לדוגמה: diners'}
              aria-invalid={!!fieldError('provider')}
              autoFocus
            />
            {fieldError('provider') && <p className="text-xs text-destructive">{fieldError('provider')}</p>}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">שם תצוגה</label>
          <input
            id={`${id}-name`}
            className={inputClass}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder={kind === 'BANK' ? 'לדוגמה: חשבון משותף' : 'לדוגמה: כרטיס עבודה'}
            maxLength={60}
            aria-invalid={!!fieldError('displayName')}
          />
          {fieldError('displayName') && <p className="text-xs text-destructive">{fieldError('displayName')}</p>}
        </div>

        {kind === 'CREDIT_CARD' && (
          <div className="space-y-1.5">
            <label htmlFor={`${id}-last4`} className="text-sm font-medium">
              4 ספרות אחרונות <span className="font-normal text-muted-foreground">(לא חובה)</span>
            </label>
            <input
              id={`${id}-last4`}
              className={cn(inputClass, 'tabular-nums text-start')}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={lastFour}
              onChange={e => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-invalid={lastFourInvalid || !!fieldError('cardLastFour')}
              aria-describedby={`${id}-last4-hint`}
            />
            <p id={`${id}-last4-hint`} className={cn('text-xs', lastFourInvalid || fieldError('cardLastFour') ? 'text-destructive' : 'text-muted-foreground')}>
              {fieldError('cardLastFour') ?? (lastFourInvalid ? 'יש להזין בדיוק 4 ספרות' : 'כדי להבדיל בין כרטיסים')}
            </p>
          </div>
        )}

        {kind === 'CREDIT_CARD' && (
          <div className="space-y-1.5 sm:col-span-2">
            <p id={`${id}-network`} className="text-sm font-medium">
              רשת <span className="font-normal text-muted-foreground">(לא חובה)</span>
            </p>
            <div role="radiogroup" aria-labelledby={`${id}-network`} className="flex flex-wrap gap-2">
              {[...CARD_NETWORKS, { key: '', label: 'אחר / לא ידוע' }].map(n => (
                <button
                  key={n.key || 'other'}
                  type="button"
                  role="radio"
                  aria-checked={network === n.key}
                  data-network={n.key || 'other'}
                  onClick={() => { setNetwork(n.key); setNetworkTouched(true) }}
                  className={chip(network === n.key)}
                >
                  {n.key ? <span dir="ltr">{n.label}</span> : n.label}
                </button>
              ))}
            </div>
            {fieldError('cardNetwork') && <p className="text-xs text-destructive">{fieldError('cardNetwork')}</p>}
          </div>
        )}
      </div>

      {!supported && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" aria-hidden />
          לספק הזה אין ייבוא מובנה. בהעלאה הראשונה תתאים את העמודות של הקובץ, ואפשר לשמור את המיפוי לפעמים הבאות.
        </p>
      )}

      {error && !error.field && <p className="text-sm text-destructive">{error.message}</p>}
      {error?.field === 'kind' && <p className="text-sm text-destructive">{error.message}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving || lastFourInvalid || !displayName.trim() || !provider}
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'שומר…' : 'הוסף חשבון'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center rounded-lg px-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ביטול
        </button>
      </div>
    </form>
  )
}
