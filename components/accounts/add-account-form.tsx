'use client'

import { useId, useState, type ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CREATABLE, KIND_META, KNOWN_PROVIDERS, importSupportedFor, type CreatableKindValue } from './account-kinds'
import { BankElement, PaymentCard } from './account-element'
import { ColorPicker } from './color-picker'
import { CARD_NETWORKS, impliedNetwork, providerLabel } from '@/lib/accounts/brands'

const OTHER = '__other__'

export interface CreatedAccount {
  id: string
  displayName: string
  kind: CreatableKindValue
}

/** What the edit window (ENG-65) starts from. */
export interface EditableAccount {
  id: string
  kind: CreatableKindValue
  provider: string
  displayName: string
  cardLastFour: string | null
  cardNetwork: string | null
  color: string | null
  transactionCount: number
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

const n = (v: number) => v.toLocaleString('he-IL')

type CreateProps = {
  mode?: 'create'
  initialKind: CreatableKindValue
  onCreated: (account: CreatedAccount) => void
  onCancel: () => void
}

type EditProps = {
  mode: 'edit'
  account: EditableAccount
  onSaved: (account: CreatedAccount) => void
  onCancel: () => void
  /** Replaces the form's own heading (the dialog's title) */
  heading?: ReactNode
  /** The positional colour the brand default falls back to */
  fallbackColor?: string
  /** Extra content above the buttons (the re-map entry) */
  children?: ReactNode
}

/** Initial provider select value and free text for a stored provider. */
function providerFields(kind: CreatableKindValue, provider: string) {
  return KNOWN_PROVIDERS.some(p => p.kind === kind && p.key === provider)
    ? { choice: provider, other: '' }
    : { choice: OTHER, other: provider }
}

export function AddAccountForm(props: Omit<CreateProps, 'mode'>) {
  return <AccountForm {...props} mode="create" />
}

/**
 * Create an account, or edit one (ENG-65): the same fields either way, with
 * the element it will look like on top, reacting to every field.
 */
export function AccountForm(props: CreateProps | EditProps) {
  const editing = props.mode === 'edit' ? props.account : null
  const initialKind = editing ? editing.kind : (props as CreateProps).initialKind
  const initialProvider = editing ? providerFields(editing.kind, editing.provider) : { choice: defaultProvider(initialKind), other: '' }

  const id = useId()
  const [kind, setKind] = useState<CreatableKindValue>(initialKind)
  const [providerChoice, setProviderChoice] = useState(initialProvider.choice)
  const [otherProvider, setOtherProvider] = useState(initialProvider.other)
  const [displayName, setDisplayName] = useState(editing?.displayName ?? '')
  const [lastFour, setLastFour] = useState(editing?.cardLastFour ?? '')
  // '' = other / unknown. Follows the issuer (Amex) until the user picks one.
  const [network, setNetwork] = useState<string>(
    editing ? editing.cardNetwork ?? '' : impliedNetwork(defaultProvider(initialKind)) ?? ''
  )
  const [networkTouched, setNetworkTouched] = useState(!!editing)
  // Account.color (ENG-66): null = brand default
  const [color, setColor] = useState<string | null>(editing?.color ?? null)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const provider = providerChoice === OTHER ? otherProvider.trim().toLowerCase() : providerChoice
  const supported = provider ? importSupportedFor(kind, provider) : true
  const lastFourInvalid = kind === 'CREDIT_CARD' && lastFour !== '' && !/^\d{4}$/.test(lastFour)
  // Merchant rules are keyed by provider: say what changes before saving (ENG-65)
  const providerChanged = !!editing && !!provider && provider !== editing.provider
  const warnProvider = providerChanged && editing!.transactionCount > 0
  const fallbackColor = props.mode === 'edit' ? props.fallbackColor : undefined

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

  /** Only the fields that changed, so an unchanged provider never asks for confirmation. */
  function editBody(account: EditableAccount) {
    const body: Record<string, unknown> = {}
    if (displayName.trim() !== account.displayName) body.displayName = displayName
    if (provider !== account.provider) {
      body.provider = provider
      if (account.transactionCount > 0) body.confirmProviderChange = true
    }
    if (kind === 'CREDIT_CARD') {
      if (lastFour !== (account.cardLastFour ?? '')) body.cardLastFour = lastFour || null
      if (network !== (account.cardNetwork ?? '')) body.cardNetwork = network || null
    }
    if (color !== account.color) body.color = color
    return body
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving || lastFourInvalid) return
    let request: { url: string; method: string; body: Record<string, unknown> }
    if (editing) {
      const body = editBody(editing)
      if (!Object.keys(body).length) {
        props.onCancel()
        return
      }
      request = { url: `/api/accounts/${encodeURIComponent(editing.id)}`, method: 'PATCH', body }
    } else {
      request = {
        url: '/api/accounts',
        method: 'POST',
        body: {
          kind,
          provider,
          displayName,
          cardLastFour: kind === 'CREDIT_CARD' && lastFour ? lastFour : undefined,
          cardNetwork: kind === 'CREDIT_CARD' && network ? network : undefined,
          color: color ?? undefined,
        },
      }
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.body),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError({ field: body.field, message: body.error ?? 'השמירה נכשלה' })
        return
      }
      const done = { id: body.id, displayName: body.displayName, kind }
      if (props.mode === 'edit') props.onSaved(done)
      else props.onCreated(done)
    } catch {
      setError({ message: 'השמירה נכשלה' })
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (field: string) => (error?.field === field ? error.message : null)
  const title = editing ? (kind === 'CREDIT_CARD' ? 'עריכת כרטיס' : 'עריכת חשבון בנק') : 'חשבון חדש'

  return (
    <form onSubmit={submit} className="space-y-4" aria-labelledby={editing && props.mode === 'edit' && props.heading ? undefined : `${id}-title`} noValidate>
      {props.mode === 'edit' && props.heading ? props.heading : <h2 id={`${id}-title`} className="font-semibold">{title}</h2>}

      {/* Wide screens: the element and its colour beside the fields, in view while they scroll */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start md:gap-6">
        <div className="space-y-4 md:sticky md:top-0">
          {!editing && (
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
          )}
          {/* Live preview: the element the account will get, reacting to every field (ENG-56/57) */}
          <div className="acct-preview flex justify-center rounded-xl bg-muted/50 px-4 py-6 sm:py-8">
            <div key={kind} className={cn('acct-enter w-full', kind === 'CREDIT_CARD' ? 'max-w-[19rem]' : 'max-w-[22rem]')}>
              {kind === 'CREDIT_CARD' ? (
                <PaymentCard
                  live
                  glassWebGL
                  provider={provider}
                  name={displayName}
                  namePlaceholder={NAME_PLACEHOLDER.CREDIT_CARD}
                  lastFour={lastFour}
                  network={network}
                  color={fallbackColor}
                  colorChoice={color}
                />
              ) : (
                <BankElement
                  glassWebGL
                  provider={provider}
                  name={displayName}
                  namePlaceholder={NAME_PLACEHOLDER.BANK}
                  color={fallbackColor}
                  colorChoice={color}
                  emptyText={editing ? 'היתרה מופיעה בעמוד החשבון' : 'היתרה תופיע אחרי העלאת הקובץ הראשון'}
                />
              )}
            </div>
          </div>
          <div>
            <ColorPicker kind={kind} provider={provider} value={color} onChange={setColor} fallbackColor={fallbackColor} />
            {fieldError('color') && <p className="text-xs text-destructive">{fieldError('color')}</p>}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${id}-provider`} className="text-sm font-medium">{kind === 'BANK' ? 'בנק' : 'ספק'}</label>
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
                  autoFocus={!editing}
                />
                {fieldError('provider') && <p className="text-xs text-destructive">{fieldError('provider')}</p>}
              </div>
            )}

            {warnProvider && (
              <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-xs leading-relaxed sm:col-span-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <p>
                  כללי בתי העסק (שמות ותיקוני קטגוריה) נשמרים לפי ספק. {n(editing!.transactionCount)} התנועות של החשבון נשארות כמו
                  שהן, אבל מעכשיו יחולו עליו הכללים של <b>{providerLabel(provider)}</b> ולא של <b>{providerLabel(editing!.provider)}</b>:
                  בקבצים שיועלו מעכשיו ובכללים שישתנו בהמשך.
                </p>
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
                  {[...CARD_NETWORKS, { key: '', label: 'אחר / לא ידוע' }].map(nw => (
                    <button
                      key={nw.key || 'other'}
                      type="button"
                      role="radio"
                      aria-checked={network === nw.key}
                      data-network={nw.key || 'other'}
                      onClick={() => { setNetwork(nw.key); setNetworkTouched(true) }}
                      className={chip(network === nw.key)}
                    >
                      {nw.key ? <span dir="ltr">{nw.label}</span> : nw.label}
                    </button>
                  ))}
                </div>
                {fieldError('cardNetwork') && <p className="text-xs text-destructive">{fieldError('cardNetwork')}</p>}
              </div>
            )}

          </div>

          {!supported && !editing && (
            <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" aria-hidden />
              לספק הזה אין ייבוא מובנה. בהעלאה הראשונה תתאים את העמודות של הקובץ, ואפשר לשמור את המיפוי לפעמים הבאות.
            </p>
          )}

          {props.mode === 'edit' && props.children}

          {error && !error.field && <p className="text-sm text-destructive" role="alert">{error.message}</p>}
          {(error?.field === 'kind' || error?.field === 'archived') && <p className="text-sm text-destructive" role="alert">{error.message}</p>}
          {error?.field === 'provider' && providerChoice !== OTHER && <p className="text-sm text-destructive" role="alert">{error.message}</p>}
        </div>
      </div>

      <div
        className={cn(
          'flex flex-wrap gap-2',
          // In the edit window the buttons stay in reach while the form scrolls
          editing && 'sticky bottom-0 -mx-5 border-t bg-[hsl(var(--surface-overlay))] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6 sm:pb-6'
        )}
      >
        <button
          type="submit"
          disabled={saving || lastFourInvalid || !displayName.trim() || !provider}
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50"
        >
          {saving ? 'שומר…' : editing ? 'שמור שינויים' : 'הוסף חשבון'}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="inline-flex h-10 items-center rounded-lg px-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ביטול
        </button>
      </div>
    </form>
  )
}
