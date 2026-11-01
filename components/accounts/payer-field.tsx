'use client'

import { useState, type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, CircleHelp, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Reveal } from '@/components/ui/reveal'
import { AccountMini } from './account-element'
import { providerLabel } from '@/lib/accounts/brands'
import {
  fromName,
  payerCountHint,
  payerEvidenceFor,
  payerReason,
  suggestPayer,
  toName,
  type PayerEvidence,
} from '@/lib/accounts/payer-suggestion'

/** A bank account a card can be paid from */
export interface PayerBank {
  id: string
  provider: string
  displayName: string
  color: string | null
  positionColor?: string
  archived: boolean
}

/** A card a new bank account can take (the bank form's "which cards it pays") */
export interface PayerCardOption {
  id: string
  provider: string
  displayName: string
  cardLastFour: string | null
  cardNetwork: string | null
  color: string | null
  positionColor?: string
  payerAccountId: string | null
}

/** What the payer fields need: the bank accounts, the payment evidence, the cards */
export interface PayerContext {
  /** Every bank account, archived included (a card may still point at one) */
  banks: PayerBank[]
  evidence: PayerEvidence[]
  /** Non-archived cards, for a new bank account */
  cards: PayerCardOption[]
  /** "YYYY-MM-DD", the evidence's today */
  today: string
}

export const UNKNOWN_PAYER_LABEL = 'לא יודע / חשבון שלא מנוהל כאן'

/** The card company's name in sentences ("מקס") */
export const companyName = (provider: string) => providerLabel(provider)

/** The non-archived bank accounts, the ones a card can be linked to */
export const linkableBanks = (ctx: PayerContext) => ctx.banks.filter(b => !b.archived)

/** The most likely payer of a card of this company among the linkable bank accounts */
export function payerSuggestion(ctx: PayerContext, provider: string): { bank: PayerBank; evidence: PayerEvidence } | null {
  const banks = linkableBanks(ctx)
  const e = provider ? suggestPayer(ctx.evidence, provider, banks.map(b => b.id)) : null
  const bank = e && banks.find(b => b.id === e.bankAccountId)
  return e && bank ? { bank, evidence: e } : null
}

function BankFace({ bank, className }: { bank: PayerBank; className?: string }) {
  return (
    <AccountMini kind="BANK" provider={bank.provider} color={bank.positionColor} colorChoice={bank.color} className={cn('w-10', className)} />
  )
}

/** The "unknown" option's mark, the size of a bank face */
function UnknownFace({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex aspect-[1.75] w-10 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground', className)}>
      <CircleHelp className="h-3.5 w-3.5" />
    </span>
  )
}

const tile = (selected: boolean) =>
  cn(
    'flex min-h-[3.5rem] w-full items-center gap-3 rounded-xl border px-3 py-2 text-start text-sm transition-[background-color,border-color,color,transform] duration-quick active:scale-[0.98] motion-reduce:transition-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    selected ? 'border-primary/50 bg-primary/10 text-foreground' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
  )

/** The tick at a selected tile's end (kept mounted so it can fade) */
function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'ms-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] duration-fast ease-ui motion-reduce:transition-none',
        on ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
      )}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
  )
}

/** A soft info box (the suggestion's reason) */
function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2.5 text-xs leading-relaxed">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p>{children}</p>
    </div>
  )
}

/**
 * The add form's "משולם מחשבון": the linkable bank accounts as tiles (radio
 * semantics) and "unknown". The suggestion is preselected by the form while
 * the user has not picked; the box under the tiles says why.
 */
export function PayerTiles({
  ctx,
  provider,
  value,
  onChange,
  labelId,
}: {
  ctx: PayerContext
  provider: string
  value: string | null
  onChange: (id: string | null) => void
  labelId: string
}) {
  const banks = linkableBanks(ctx)
  const suggestion = payerSuggestion(ctx, provider)
  const reason = suggestion
    ? payerReason(suggestion.evidence, suggestion.bank.displayName, companyName(provider), ctx.today) +
      (value === suggestion.bank.id ? ', לכן בחרנו אותו.' : '.')
    : null
  // The box closes with its last text, not an empty one
  const [shownReason, setShownReason] = useState(reason)
  if (reason && reason !== shownReason) setShownReason(reason)
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2 sm:grid-cols-2">
        {banks.map(b => (
          <button key={b.id} type="button" role="radio" aria-checked={value === b.id} onClick={() => onChange(b.id)} className={tile(value === b.id)}>
            <BankFace bank={b} />
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{b.displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">{providerLabel(b.provider)}</span>
            </span>
            <Tick on={value === b.id} />
          </button>
        ))}
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={tile(value === null)}>
          <UnknownFace />
          <span className="min-w-0 text-[13px] leading-snug">{UNKNOWN_PAYER_LABEL}</span>
          <Tick on={value === null} />
        </button>
      </div>
      <Reveal open={!!suggestion}>
        <InfoNote>{shownReason}</InfoNote>
      </Reveal>
    </div>
  )
}

/**
 * A menu of the linkable bank accounts and "unknown", out of `children` (the
 * trigger). The current payer stays listed when it is archived, so the
 * choice can be read, but can't be picked again.
 */
export function PayerMenu({
  ctx,
  value,
  onChange,
  align = 'start',
  children,
}: {
  ctx: PayerContext
  value: string | null
  onChange: (id: string | null) => void
  align?: 'start' | 'end'
  children: ReactNode
}) {
  const banks = ctx.banks.filter(b => !b.archived || b.id === value)
  return (
    <DropdownMenu.Root dir="rtl">
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="menu-panel z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[min(22rem,calc(100vw-1.5rem))] rounded-xl surface-overlay p-1 text-sm text-card-foreground shadow-e2"
        >
          <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">משולם מחשבון</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={value ?? ''} onValueChange={v => onChange(v || null)}>
            {banks.map(b => (
              <DropdownMenu.RadioItem
                key={b.id}
                value={b.id}
                disabled={b.archived}
                className="group flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors data-[disabled]:cursor-default data-[highlighted]:bg-muted data-[disabled]:opacity-60"
              >
                <BankFace bank={b} className="w-9" />
                <span className="min-w-0 flex-1 truncate">
                  {b.displayName}
                  {b.archived && <span className="text-xs text-muted-foreground"> (בארכיון)</span>}
                </span>
                <MenuTick />
              </DropdownMenu.RadioItem>
            ))}
            <DropdownMenu.RadioItem
              value=""
              className="group flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors data-[highlighted]:bg-muted"
            >
              <UnknownFace className="w-9" />
              <span className="min-w-0 flex-1">{UNKNOWN_PAYER_LABEL}</span>
              <MenuTick />
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function MenuTick() {
  return (
    <DropdownMenu.ItemIndicator
      forceMount
      className="flex transition-[opacity,transform] duration-fast ease-ui data-[state=unchecked]:scale-50 data-[state=unchecked]:opacity-0 motion-reduce:transition-none"
    >
      <Check className="h-4 w-4 text-primary" aria-hidden />
    </DropdownMenu.ItemIndicator>
  )
}

/**
 * The edit window's "משולם מחשבון": a button with the payer's face and name
 * that opens PayerMenu, and a hint from the bank rows under it.
 */
export function PayerPicker({
  ctx,
  provider,
  value,
  onChange,
  labelId,
}: {
  ctx: PayerContext
  provider: string
  value: string | null
  onChange: (id: string | null) => void
  labelId: string
}) {
  const current = value ? ctx.banks.find(b => b.id === value) : undefined
  const company = companyName(provider)
  const own = value ? payerEvidenceFor(ctx.evidence, provider, value) : null
  const suggestion = payerSuggestion(ctx, provider)
  let hint: string | null = null
  if (own) hint = payerCountHint(own, company, ctx.today)
  else if (suggestion && suggestion.bank.id !== value) {
    hint = value
      ? `לא נמצאו תשלומים ${toName(company)} בחשבון הזה; נראה שמשולם ${fromName(suggestion.bank.displayName)}.`
      : `נראה שמשולם ${fromName(suggestion.bank.displayName)}.`
  }
  return (
    <div className="space-y-1.5">
      <PayerMenu ctx={ctx} value={value} onChange={onChange}>
        <button
          type="button"
          aria-labelledby={labelId}
          aria-describedby={hint ? `${labelId}-hint` : undefined}
          className="flex h-12 w-full items-center gap-3 rounded-lg border bg-background px-3 text-start text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted/60"
        >
          {current ? <BankFace bank={current} className="w-9" /> : <UnknownFace className="w-9" />}
          <span className="min-w-0 flex-1 truncate">
            {current ? current.displayName : 'לא ידוע'}
            {current?.archived && <span className="text-xs text-muted-foreground"> (בארכיון)</span>}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PayerMenu>
      {hint && (
        <p id={`${labelId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * The bank form's reverse question: which cards the new account pays
 * (checkbox tiles). A card linked elsewhere moves to the new account.
 */
export function PaidCardsField({
  ctx,
  value,
  onChange,
  labelId,
}: {
  ctx: PayerContext
  value: string[]
  onChange: (ids: string[]) => void
  labelId: string
}) {
  const bankName = (id: string | null) => (id ? ctx.banks.find(b => b.id === id)?.displayName : undefined)
  return (
    <div role="group" aria-labelledby={labelId} className="grid gap-2 sm:grid-cols-2">
      {ctx.cards.map(c => {
        const on = value.includes(c.id)
        const from = bankName(c.payerAccountId)
        return (
          <button
            key={c.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onChange(on ? value.filter(id => id !== c.id) : [...value, c.id])}
            className={tile(on)}
          >
            <AccountMini kind="CREDIT_CARD" provider={c.provider} network={c.cardNetwork} color={c.positionColor} colorChoice={c.color} className="w-10" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">
                {c.displayName}
                {c.cardLastFour && <span className="font-normal text-muted-foreground" dir="ltr"> · {c.cardLastFour}</span>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {from ? (on ? `יועבר ${fromName(from)}` : `משולם ${fromName(from)}`) : 'בלי חשבון משלם'}
              </span>
            </span>
            <Tick on={on} />
          </button>
        )
      })}
    </div>
  )
}
