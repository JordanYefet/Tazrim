'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeftRight, ChevronLeft, CreditCard, Landmark, Plus, Search, Store, TextSearch } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { providerLabel } from '@/lib/accounts/brands'
import { AppDialog } from '@/components/ui/app-dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { GenericDescriptions } from './generic-descriptions'
import { IssuerCategories } from './issuer-categories'
import { MerchantMappings } from './merchant-mappings'
import { KeywordCount } from './category-picker'
import { normalizeKeyword, validKeyword } from '@/lib/insights/keyword-rules'
import type { CategorySource } from '@/lib/insights/category-sources'
import type { IssuerCategory } from '@/lib/db/category-mappings'
import type { BankDescription, CardMerchant } from '@/lib/db/category-choices'

type Kind = 'EXPENSE' | 'INCOME'

export interface CategoryItem {
  id: string
  name: string
  /** Its colour in the charts; null when it has no spending to rank */
  color: string | null
  sources: CategorySource[]
}

interface Alias {
  id: string
  provider: string
  originalName: string
  displayName: string
  categoryOverride: string | null
}

type Open =
  | { type: 'category'; id: string }
  | { type: 'pending' }
  | { type: 'generic' }
  | { type: 'merchants' }
  | { type: 'create' }
  | null

const KIND_LABEL: Record<Kind, string> = { EXPENSE: 'הוצאות', INCOME: 'הכנסות' }
const KIND_HINT: Record<Kind, string> = {
  EXPENSE: 'לחיובי כרטיסי אשראי ולתנועות יוצאות בבנק',
  INCOME: 'לתנועות נכנסות בבנק',
}
const KIND_DOT: Record<Kind, string> = { EXPENSE: 'bg-[hsl(var(--expense))]', INCOME: 'bg-[hsl(var(--income))]' }

/**
 * /categories as one list (Settings style): expense or income categories; a category
 * opens the app's window with what fills it automatically.
 * The rarer lists (transactions categorised one by one, merchant names) are rows below.
 */
export function CategoriesView({
  expense,
  income,
  pending,
  choices,
  generic,
  aliases,
}: {
  expense: CategoryItem[]
  income: CategoryItem[]
  pending: IssuerCategory[]
  /** What a category can be filled from, for the windows' pickers */
  choices: SourceChoices
  generic: string[]
  aliases: Alias[]
}) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('EXPENSE')
  const [open, setOpen] = useState<Open>(null)
  // A fresh new-category form per opening (not on closing: that would cut the window's exit short)
  const [createRun, setCreateRun] = useState(0)
  // The last window's content stays while it animates out
  const last = useRef<Open>(null)
  if (open) last.current = open
  const shown = open ?? last.current

  function closeAndRefresh() {
    setOpen(null)
    router.refresh()
  }

  // /categories#generic (from the bank table) arrives with that window open
  useEffect(() => {
    if (window.location.hash === '#generic') setOpen({ type: 'generic' })
  }, [])

  const lists = { EXPENSE: expense, INCOME: income }
  const categories = lists[kind]
  const expenseNames = expense.map(c => ({ id: c.id, name: c.name }))
  // Each category's chart colour, for the pills in the lists' windows
  const colors = Object.fromEntries([...expense, ...income].filter(c => c.color).map(c => [c.name, c.color!]))
  const category = shown?.type === 'category' ? [...expense, ...income].find(c => c.id === shown.id) : undefined
  const categoryKind: Kind = category && income.some(c => c.id === category.id) ? 'INCOME' : 'EXPENSE'

  return (
    <div className="space-y-5">
      <SegmentedKind kind={kind} onChange={k => setKind(k)} counts={{ EXPENSE: expense.length, INCOME: income.length }} />

      {kind === 'EXPENSE' && pending.length > 0 && (
        <button
          onClick={() => setOpen({ type: 'pending' })}
          className="flex w-full items-center gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-start transition-colors hover:bg-amber-500/15 active:scale-[0.99]"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span className="flex-1 text-sm">
            <span className="font-semibold">
              {pending.length === 1 ? 'קטגוריה חדשה מחברות האשראי' : `${pending.length} קטגוריות חדשות מחברות האשראי`}
            </span>{' '}
            {pending.length === 1 ? 'מחכה' : 'מחכות'} שתבחר להן קטגוריה
          </span>
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      )}

      {/* Keyed on the kind, so the switch slides the list in from its tab's side (income is on the left) */}
      <div key={kind} className={cn('categories-list space-y-1.5', kind === 'INCOME' ? 'categories-list--from-left' : 'categories-list--from-right')}>
        <p className="px-4 text-xs font-medium text-muted-foreground">{KIND_HINT[kind]}</p>
        <ul className="overflow-hidden rounded-2xl surface divide-y">
          {categories.map(c => (
            <li key={c.id}>
              <button
                onClick={() => setOpen({ type: 'category', id: c.id })}
                className="flex h-[52px] w-full items-center gap-3.5 px-4 text-start transition-colors hover:bg-muted/40 active:bg-muted/60"
              >
                <Swatch color={c.color} />
                <span className="min-w-0 flex-1 truncate text-[15px]">{c.name}</span>
                {c.sources.length > 0 && (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs',
                      kind === 'EXPENSE'
                        ? 'bg-[hsl(var(--expense))]/10 text-[hsl(var(--expense))]'
                        : 'bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]'
                    )}
                  >
                    אוטומטי
                  </span>
                )}
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <NewCategoryRow onClick={() => { setCreateRun(n => n + 1); setOpen({ type: 'create' }) }} />
          </li>
        </ul>
        <p className="px-4 text-xs leading-relaxed text-muted-foreground">
          הצבע של כל קטגוריה הוא הצבע שלה בגרפים. לחיצה על קטגוריה מראה מה ממלא אותה אוטומטית.
        </p>
      </div>

      <ul className="overflow-hidden rounded-2xl surface divide-y">
        <li>
          <RowButton
            icon={<ArrowLeftRight className="h-4 w-4" aria-hidden />}
            title="תנועות שמסווגים אחת אחת"
            sub="שיק, העברה, משיכת מזומן…"
            value={generic.length}
            onClick={() => setOpen({ type: 'generic' })}
          />
        </li>
        <li>
          <RowButton
            icon={<Store className="h-4 w-4" aria-hidden />}
            title="שמות בתי עסק"
            sub="שם מוצג לבית עסק, וקטגוריה קבועה אם בחרת"
            value={aliases.length}
            onClick={() => setOpen({ type: 'merchants' })}
          />
        </li>
      </ul>

      <AppDialog
        open={open?.type === 'category' && !!category}
        onOpenChange={o => !o && setOpen(null)}
        title={
          category && (
            <span className="flex items-center gap-2.5">
              <Swatch color={category.color} size="lg" />
              <bdi>{category.name}</bdi>
            </span>
          )
        }
      >
        {category && (
          <CategoryDetails
            key={category.id}
            category={category}
            kind={categoryKind}
            choices={choices}
            onChanged={() => router.refresh()}
            onDeleted={closeAndRefresh}
          />
        )}
      </AppDialog>

      <AppDialog open={open?.type === 'create'} onOpenChange={o => !o && setOpen(null)} title="קטגוריה חדשה">
        {shown?.type === 'create' && (
          <NewCategoryForm
            key={createRun}
            initialKind={kind}
            choices={choices}
            onCreated={closeAndRefresh}
          />
        )}
      </AppDialog>

      <AppDialog open={open?.type === 'pending'} onOpenChange={o => !o && setOpen(null)} title="מחכות לקטגוריה">
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          קטגוריות שהגיעו בקבצים של חברות האשראי ועוד אין להן קטגוריה שלך. בחירה כאן חלה על כל העסקאות שלהן, גם בקבצים הבאים.
        </p>
        {shown?.type === 'pending' && <IssuerCategories initial={pending} categories={expenseNames} colors={colors} />}
      </AppDialog>

      <AppDialog open={open?.type === 'generic'} onOpenChange={o => !o && setOpen(null)} title="תנועות שמסווגים אחת אחת">
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          תיאורים בבנק שלא אומרים למי הכסף הלך, כמו שיק או העברה. אין להם כלל אוטומטי: לכל תנועה בוחרים קטגוריה בנפרד, עם הצעה לפי סכום דומה.
          הוספת תיאור מבטלת את הכללים שנשמרו לו ומנקה את הקטגוריות שהם נתנו; קטגוריה שנבחרה ידנית נשארת.
        </p>
        {shown?.type === 'generic' && <GenericDescriptions initial={generic} />}
      </AppDialog>

      <AppDialog open={open?.type === 'merchants'} onOpenChange={o => !o && setOpen(null)} title="שמות בתי עסק">
        <div className="mt-4">{shown?.type === 'merchants' && <MerchantMappings initial={aliases} categories={expenseNames} colors={colors} />}</div>
      </AppDialog>
    </div>
  )
}

/** Expense / income, with a thumb that slides between them */
function SegmentedKind({ kind, onChange, counts }: { kind: Kind; onChange: (k: Kind) => void; counts?: Record<Kind, number> }) {
  return (
    <div role="tablist" aria-label="סוג קטגוריה" className="relative grid grid-cols-2 rounded-xl bg-muted p-[3px]">
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-[3px] start-[3px] w-[calc(50%-3px)] rounded-[9px] bg-card shadow-sm',
          'transition-transform duration-base ease-ui motion-reduce:transition-none',
          // RTL: the second half is to the left
          kind === 'INCOME' && '-translate-x-full'
        )}
      />
      {(['EXPENSE', 'INCOME'] as const).map(k => (
        <button
          key={k}
          role="tab"
          aria-selected={kind === k}
          onClick={() => onChange(k)}
          className={cn(
            'relative z-10 flex h-9 items-center justify-center gap-2 rounded-[9px] text-[15px] transition-colors duration-base',
            kind === k ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground'
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', KIND_DOT[k])} aria-hidden />
          {KIND_LABEL[k]}
          {counts && <span className="text-xs font-normal tabular-nums text-muted-foreground">{counts[k]}</span>}
        </button>
      ))}
    </div>
  )
}

function Swatch({ color, size = 'md' }: { color: string | null; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn('shrink-0', size === 'lg' ? 'h-5 w-5 rounded-md' : 'h-3.5 w-3.5 rounded')}
      style={{ background: color ?? 'hsl(var(--muted-foreground) / 0.35)' }}
    />
  )
}

function RowButton({ icon, title, sub, value, onClick }: {
  icon: React.ReactNode
  title: string
  sub: string
  value: number
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="flex min-h-[56px] w-full items-center gap-3.5 px-4 py-2 text-start transition-colors hover:bg-muted/40 active:bg-muted/60">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <span className="text-[15px] tabular-nums text-muted-foreground">{value}</span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
    </button>
  )
}

/** The list's last row: opens the new-category window */
function NewCategoryRow({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-[52px] w-full items-center gap-3.5 px-4 text-start text-[15px] text-primary transition-colors hover:bg-muted/40">
      <span className="flex h-3.5 w-3.5 items-center justify-center" aria-hidden><Plus className="h-4 w-4" /></span>
      קטגוריה חדשה
    </button>
  )
}

/** What a category can be filled from, for the pickers */
export interface SourceChoices {
  issuer: IssuerCategory[]
  merchants: CardMerchant[]
  /** Bank descriptions of debits (expense categories) and credits (income ones) */
  descriptions: { OUT: BankDescription[]; IN: BankDescription[] }
}

type GroupType = 'issuer' | 'merchant' | 'bank' | 'keyword'

/** The kinds of source, each with its own colour and icon so they read apart at a glance */
const GROUPS: Record<GroupType, { title: string; sub: string; add: string; icon: React.ReactNode; tone: string; chip: string }> = {
  issuer: {
    title: 'קטגוריות של חברות האשראי',
    sub: 'כל העסקאות בקטגוריה הזאת בקובץ של החברה',
    add: 'קטגוריה מחברת אשראי',
    icon: <CreditCard className="h-4 w-4" aria-hidden />,
    tone: 'bg-violet-500',
    chip: 'bg-violet-500/10 ring-violet-500/30',
  },
  merchant: {
    title: 'בתי עסק',
    sub: 'כל החיובים מבית עסק מסוים, בכל כרטיס',
    add: 'בית עסק',
    icon: <Store className="h-4 w-4" aria-hidden />,
    tone: 'bg-orange-500',
    chip: 'bg-orange-500/10 ring-orange-500/30',
  },
  bank: {
    title: 'תיאורים בבנק',
    sub: 'כל התנועות בבנק עם התיאור הזה',
    add: 'תיאור מהבנק',
    icon: <Landmark className="h-4 w-4" aria-hidden />,
    tone: 'bg-sky-500',
    chip: 'bg-sky-500/10 ring-sky-500/30',
  },
  keyword: {
    title: 'טקסט בתנועה',
    sub: 'כל התנועות שמכילות את הטקסט, בכרטיסים ובבנק',
    add: 'טקסט',
    icon: <TextSearch className="h-4 w-4" aria-hidden />,
    tone: 'bg-emerald-500',
    chip: 'bg-emerald-500/10 ring-emerald-500/30',
  },
}

/** A source of one of the groups, as a key, a label and its own data */
interface SourceRef {
  key: string
  label: string
  sub?: string
  source: CategorySource
}

function keyOf(s: CategorySource): string {
  switch (s.type) {
    case 'issuer': return `i|${s.provider}|${s.sourceCategory}`
    case 'merchant': return `m|${s.provider}|${s.originalName}`
    case 'bank': return `b|${s.provider}|${s.direction}|${s.originalDescription}`
    // A pattern is one rule whatever its case
    case 'keyword': return `k|${s.pattern.toLowerCase()}`
  }
}

function refOf(s: CategorySource): SourceRef {
  if (s.type === 'issuer') return { key: keyOf(s), label: s.sourceCategory, sub: providerLabel(s.provider), source: s }
  if (s.type === 'merchant') return { key: keyOf(s), label: s.displayName, sub: providerLabel(s.provider), source: s }
  if (s.type === 'keyword') return { key: keyOf(s), label: s.pattern, source: s }
  return { key: keyOf(s), label: s.originalDescription, sub: providerLabel(s.provider), source: s }
}

/** Everything one group could add for a category of this kind, minus what it already has */
function choicesFor(type: GroupType, kind: Kind, choices: SourceChoices, taken: Set<string>): SourceRef[] {
  // A contains-text rule is typed, not picked from a list
  if (type === 'keyword') return []
  const all: SourceRef[] =
    type === 'issuer'
      ? choices.issuer.map(r => refOf({ type: 'issuer', provider: r.provider, sourceCategory: r.sourceCategory, count: r.count }))
      : type === 'merchant'
        ? choices.merchants.map(m => refOf({ type: 'merchant', provider: m.provider, originalName: m.originalName, displayName: m.displayName }))
        : choices.descriptions[kind === 'EXPENSE' ? 'OUT' : 'IN'].map(d =>
            refOf({ type: 'bank', provider: d.provider, originalDescription: d.originalDescription, direction: kind === 'EXPENSE' ? 'OUT' : 'IN' })
          )
  return all.filter(r => !taken.has(r.key))
}

/** Gives a category one source: the matching rule or mapping, applied to the stored rows */
async function addSource(s: CategorySource, category: string): Promise<string | null> {
  const json = { 'Content-Type': 'application/json' }
  const res =
    s.type === 'issuer'
      ? await fetch('/api/category-mappings', { method: 'PUT', headers: json, body: JSON.stringify({ provider: s.provider, sourceCategory: s.sourceCategory, category }) })
      : s.type === 'merchant'
        ? await fetch('/api/aliases', {
            method: 'PATCH',
            headers: json,
            body: JSON.stringify({ provider: s.provider, originalName: s.originalName, displayName: s.displayName, categoryOverride: category }),
          })
        : s.type === 'keyword'
          ? await fetch('/api/category-keyword-rules', { method: 'POST', headers: json, body: JSON.stringify({ pattern: s.pattern, category }) })
          : await fetch('/api/bank/category-rules', {
              method: 'POST',
              headers: json,
              body: JSON.stringify({ provider: s.provider, originalDescription: s.originalDescription, direction: s.direction, category }),
            })
  return res.ok ? null : ((await res.json().catch(() => null))?.error ?? 'השיוך נכשל')
}

async function removeSource(s: CategorySource): Promise<boolean> {
  const json = { 'Content-Type': 'application/json' }
  const res =
    s.type === 'issuer'
      ? await fetch('/api/category-mappings', { method: 'DELETE', headers: json, body: JSON.stringify({ provider: s.provider, sourceCategory: s.sourceCategory }) })
      : s.type === 'merchant'
        ? await fetch('/api/aliases', {
            method: 'PATCH',
            headers: json,
            body: JSON.stringify({ provider: s.provider, originalName: s.originalName, displayName: s.displayName, categoryOverride: null }),
          })
        : s.type === 'keyword'
          ? await fetch(`/api/category-keyword-rules/${encodeURIComponent(s.id)}`, { method: 'DELETE' })
          : await fetch('/api/bank/category-rules', {
              method: 'DELETE',
              headers: json,
              body: JSON.stringify({ provider: s.provider, originalDescription: s.originalDescription, direction: s.direction }),
            })
  return res.ok
}

/**
 * One kind of source: its own colour and icon, its sources as pills (tap to select,
 * then remove below, as on the one-by-one list), and "+ add" opening a search in place
 * (for contains-text rules, a text field with how many rows it reaches).
 */
function SourceGroup({ type, kind, items, options, onAdd, onRemove }: {
  type: GroupType
  /** The category's kind: which rows a contains-text rule counts */
  kind: Kind
  items: SourceRef[]
  options: SourceRef[]
  onAdd: (ref: SourceRef) => void
  onRemove: (refs: SourceRef[]) => void
}) {
  const g = GROUPS[type]
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const found = query.trim() ? options.filter(o => o.label.includes(query.trim())).slice(0, 8) : options.slice(0, 8)
  // Contains-text rules are typed: "+ טקסט" is always there, and the field adds what it holds
  const typed = type === 'keyword'
  const canAdd = typed || options.length > 0
  const typedRef = typed && validKeyword(query) ? refOf({ type: 'keyword', id: '', pattern: normalizeKeyword(query) }) : null
  const typedTaken = !!typedRef && items.some(r => r.key === typedRef.key)

  function addTyped() {
    if (!typedRef || typedTaken) return
    onAdd(typedRef)
    setQuery('')
  }

  return (
    <section className="overflow-hidden rounded-2xl ring-1 ring-inset ring-border">
      <div className="flex items-center gap-2.5 bg-muted/40 px-3.5 py-2.5">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white', g.tone)}>{g.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{g.title}</span>
          <span className="block text-xs text-muted-foreground">
            {typed && kind === 'INCOME' ? 'כל התנועות הנכנסות בבנק שמכילות את הטקסט' : g.sub}
          </span>
        </span>
      </div>
      <div className="space-y-3 p-3.5">
        <div className="flex flex-wrap gap-2">
          {items.map(r => {
            const on = selected.has(r.key)
            return (
              <button
                key={r.key}
                aria-pressed={on}
                title={r.sub}
                onClick={() => setSelected(prev => { const n = new Set(prev); if (!n.delete(r.key)) n.add(r.key); return n })}
                className={cn(
                  'inline-flex h-8 items-center justify-center rounded-full px-3.5 text-sm ring-1 ring-inset transition-[background-color,box-shadow,transform] duration-fast active:scale-[0.97]',
                  on ? 'bg-destructive/10 text-destructive ring-destructive/40' : g.chip
                )}
              >
                <bdi>{r.label}</bdi>
              </button>
            )
          })}
          {!adding && canAdd && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-dashed px-3.5 text-sm text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {g.add}
            </button>
          )}
          {items.length === 0 && !adding && !canAdd && <span className="text-sm text-muted-foreground">אין מה לשייך</span>}
        </div>

        {selected.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => { onRemove(items.filter(r => selected.has(r.key))); setSelected(new Set()) }}
              className="h-9 flex-1 rounded-xl bg-destructive/10 text-sm font-medium text-destructive transition-[background-color,transform] hover:bg-destructive/15 active:scale-[0.97]"
            >
              {selected.size === 1 ? 'הסר' : `הסר ${selected.size}`}
            </button>
            <button onClick={() => setSelected(new Set())} className="h-9 rounded-xl bg-muted px-4 text-sm transition-[background-color,transform] hover:bg-muted/70 active:scale-[0.97]">
              ביטול
            </button>
          </div>
        )}

        {adding && typed && (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">הטקסט שהתנועות מכילות</span>
                <TextSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  autoFocus
                  dir="auto"
                  placeholder="למשל ACME MUSIC"
                  className="h-9 w-full rounded-xl border bg-background ps-9 pe-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addTyped() }
                    if (e.key === 'Escape') { setAdding(false); setQuery('') }
                  }}
                />
              </label>
              <button
                onClick={addTyped}
                disabled={!typedRef || typedTaken}
                className="h-9 shrink-0 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-[opacity,transform] active:scale-[0.97] disabled:opacity-40"
              >
                הוספה
              </button>
              <button onClick={() => { setAdding(false); setQuery('') }} className="h-9 shrink-0 rounded-xl bg-muted px-3 text-sm">סיום</button>
            </div>
            {typedTaken ? (
              <span className="block px-1 text-xs text-muted-foreground">כבר ברשימה</span>
            ) : (
              <KeywordCount pattern={query} kind={kind} className="block px-1" />
            )}
          </div>
        )}

        {adding && !typed && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <label className="relative flex-1">
                <span className="sr-only">חיפוש {g.add}</span>
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  autoFocus
                  placeholder={`חיפוש ${g.add}`}
                  className="h-9 w-full rounded-xl border bg-background ps-9 pe-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setQuery('') } }}
                />
              </label>
              <button onClick={() => { setAdding(false); setQuery('') }} className="h-9 rounded-xl bg-muted px-3 text-sm">סיום</button>
            </div>
            <ul className="max-h-48 overflow-y-auto rounded-xl bg-muted/40 divide-y divide-border/60">
              {found.map(o => (
                <li key={o.key}>
                  <button
                    onClick={() => onAdd(o)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-muted"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <bdi className="min-w-0 flex-1 truncate">{o.label}</bdi>
                    {o.sub && <span className="shrink-0 text-xs text-muted-foreground">{o.sub}</span>}
                  </button>
                </li>
              ))}
              {found.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">לא נמצא</li>}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

/** The groups a category of this kind can have: cards are expenses, so income has only the bank */
const groupsFor = (kind: Kind): GroupType[] => (kind === 'EXPENSE' ? ['issuer', 'merchant', 'bank', 'keyword'] : ['bank', 'keyword'])

/** One category's window: what fills it automatically, by kind of source; rename and delete */
function CategoryDetails({ category, kind, choices, onChanged, onDeleted }: {
  category: CategoryItem
  kind: Kind
  choices: SourceChoices
  onChanged: () => void
  onDeleted: () => void
}) {
  const { confirm, dialog } = useConfirm()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refs = category.sources.map(refOf)
  const taken = new Set(refs.map(r => r.key))

  async function add(ref: SourceRef) {
    const err = await addSource(ref.source, category.name)
    setError(err)
    if (!err) onChanged()
  }

  async function remove(list: SourceRef[]) {
    for (const r of list) {
      if (!(await removeSource(r.source))) { setError('ההסרה נכשלה'); break }
    }
    onChanged()
  }

  async function rename() {
    if (!renaming?.trim() || renaming.trim() === category.name) { setRenaming(null); return }
    const res = await fetch(`/api/categories/${category.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renaming.trim() }),
    })
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'שינוי השם נכשל'); return }
    setRenaming(null)
    setError(null)
    onChanged()
  }

  async function deleteCategory() {
    if (!(await confirm({ title: <>למחוק את הקטגוריה <bdi>{category.name}</bdi>?</> }))) return
    await fetch(`/api/categories/${category.id}`, { method: 'DELETE' })
    onDeleted()
  }

  return (
    <div className="mt-1 space-y-4">
      <p className="text-sm text-muted-foreground">{kind === 'EXPENSE' ? 'קטגוריית הוצאה' : 'קטגוריית הכנסה'}</p>
      <h3 className="text-sm font-semibold">מה ממלא אותה אוטומטית</h3>
      {groupsFor(kind).map(type => (
        <SourceGroup
          key={type}
          type={type}
          kind={kind}
          items={refs.filter(r => r.source.type === type)}
          options={choicesFor(type, kind, choices, taken)}
          onAdd={add}
          onRemove={remove}
        />
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {renaming !== null ? (
        <div className="flex gap-2">
          <input
            autoFocus
            aria-label="שם חדש"
            className="min-w-0 flex-1 rounded-xl border bg-background px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
            value={renaming}
            onChange={e => setRenaming(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setRenaming(null) }}
          />
          <button onClick={rename} className="h-11 rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-transform active:scale-[0.97]">שמירה</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setRenaming(category.name)}
            className="h-11 flex-1 rounded-xl bg-muted text-[15px] transition-[background-color,transform] hover:bg-muted/70 active:scale-[0.97]"
          >
            שינוי שם
          </button>
          <button
            onClick={deleteCategory}
            className="h-11 flex-1 rounded-xl bg-destructive/10 text-[15px] text-destructive transition-[background-color,transform] hover:bg-destructive/15 active:scale-[0.97]"
          >
            מחיקה
          </button>
        </div>
      )}
      {dialog}
    </div>
  )
}

/** The new-category window: name, kind, and its sources chosen up front, all saved on "צור" */
function NewCategoryForm({ initialKind, choices, onCreated }: {
  initialKind: Kind
  choices: SourceChoices
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>(initialKind)
  const [picked, setPicked] = useState<SourceRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const taken = new Set(picked.map(r => r.key))
  // A kind change drops sources the other kind can't have (cards are expenses)
  const kept = picked.filter(r => groupsFor(kind).includes(r.source.type) && (r.source.type !== 'bank' || r.source.direction === (kind === 'EXPENSE' ? 'OUT' : 'IN')))

  async function create() {
    if (!name.trim()) { setError('צריך שם'); return }
    setSaving(true)
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), kind }),
    })
    if (!res.ok) { setSaving(false); setError('שם כבר קיים'); return }
    for (const r of kept) {
      const err = await addSource(r.source, name.trim())
      if (err) { setError(err); break }
    }
    setSaving(false)
    onCreated()
  }

  return (
    <div className="mt-4 space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm text-muted-foreground">שם</span>
        <input
          autoFocus
          className="h-11 w-full rounded-xl border bg-background px-3.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </label>
      <SegmentedKind kind={kind} onChange={setKind} />
      <h3 className="text-sm font-semibold">מה ימלא אותה אוטומטית</h3>
      <p className="-mt-2 text-xs text-muted-foreground">אפשר לבחור כבר עכשיו, או לדלג ולבחור אחר כך מהטבלאות.</p>
      {groupsFor(kind).map(type => (
        <SourceGroup
          key={`${kind}|${type}`}
          type={type}
          kind={kind}
          items={kept.filter(r => r.source.type === type)}
          options={choicesFor(type, kind, choices, taken)}
          onAdd={ref => setPicked(prev => [...prev, ref])}
          onRemove={list => setPicked(prev => prev.filter(r => !list.some(x => x.key === r.key)))}
        />
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        onClick={create}
        disabled={saving}
        className="h-11 w-full rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-[opacity,transform] active:scale-[0.97] disabled:opacity-50"
      >
        צור קטגוריה
      </button>
    </div>
  )
}
