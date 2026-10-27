'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeftRight, ChevronLeft, Plus, Store, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { providerLabel } from '@/lib/accounts/brands'
import { AppDialog } from '@/components/ui/app-dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { GenericDescriptions } from './generic-descriptions'
import { IssuerCategories } from './issuer-categories'
import { MerchantMappings } from './merchant-mappings'
import type { CategorySource } from '@/lib/insights/category-sources'
import type { IssuerCategory } from '@/lib/db/category-mappings'

type Kind = 'EXPENSE' | 'INCOME'

export interface CategoryItem {
  id: string
  name: string
  /** Spent (or received) this year */
  total: number
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
  | null

const KIND_LABEL: Record<Kind, string> = { EXPENSE: 'הוצאות', INCOME: 'הכנסות' }
const KIND_HINT: Record<Kind, string> = {
  EXPENSE: 'לחיובי כרטיסי אשראי ולתנועות יוצאות בבנק',
  INCOME: 'לתנועות נכנסות בבנק',
}
const KIND_DOT: Record<Kind, string> = { EXPENSE: 'bg-[hsl(var(--expense))]', INCOME: 'bg-[hsl(var(--income))]' }

/**
 * /categories as one list (Settings style): expense or income categories; a category
 * opens the app's window with its year's total and what fills it automatically.
 * The rarer lists (transactions categorised one by one, merchant names) are rows below.
 */
export function CategoriesView({
  expense,
  income,
  pending,
  issuer,
  generic,
  aliases,
  year,
}: {
  expense: CategoryItem[]
  income: CategoryItem[]
  pending: IssuerCategory[]
  issuer: IssuerCategory[]
  generic: string[]
  aliases: Alias[]
  year: string
}) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('EXPENSE')
  const [open, setOpen] = useState<Open>(null)
  // The last window's content stays while it animates out
  const last = useRef<Open>(null)
  if (open) last.current = open
  const shown = open ?? last.current

  // /categories#generic (from the bank table) arrives with that window open
  useEffect(() => {
    if (window.location.hash === '#generic') setOpen({ type: 'generic' })
  }, [])

  const lists = { EXPENSE: expense, INCOME: income }
  const categories = lists[kind]
  const expenseNames = expense.map(c => ({ id: c.id, name: c.name }))
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
            <NewCategoryRow kind={kind} onAdded={() => router.refresh()} />
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
            year={year}
            issuer={issuer}
            onChanged={() => router.refresh()}
            onDeleted={() => { setOpen(null); router.refresh() }}
          />
        )}
      </AppDialog>

      <AppDialog open={open?.type === 'pending'} onOpenChange={o => !o && setOpen(null)} title="מחכות לקטגוריה">
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          קטגוריות שהגיעו בקבצים של חברות האשראי ועוד אין להן קטגוריה שלך. בחירה כאן חלה על כל העסקאות שלהן, גם בקבצים הבאים.
        </p>
        {shown?.type === 'pending' && <IssuerCategories initial={pending} categories={expenseNames} />}
      </AppDialog>

      <AppDialog open={open?.type === 'generic'} onOpenChange={o => !o && setOpen(null)} title="תנועות שמסווגים אחת אחת">
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          תיאורים בבנק שלא אומרים למי הכסף הלך, כמו שיק או העברה. אין להם כלל אוטומטי: לכל תנועה בוחרים קטגוריה בנפרד, עם הצעה לפי סכום דומה.
          הוספת תיאור מבטלת את הכללים שנשמרו לו ומנקה את הקטגוריות שהם נתנו; קטגוריה שנבחרה ידנית נשארת.
        </p>
        {shown?.type === 'generic' && <GenericDescriptions initial={generic} />}
      </AppDialog>

      <AppDialog open={open?.type === 'merchants'} onOpenChange={o => !o && setOpen(null)} title="שמות בתי עסק" className="sm:max-w-3xl">
        <div className="mt-4">{shown?.type === 'merchants' && <MerchantMappings initial={aliases} categories={expenseNames} />}</div>
      </AppDialog>
    </div>
  )
}

/** Expense / income, with a thumb that slides between them */
function SegmentedKind({ kind, onChange, counts }: { kind: Kind; onChange: (k: Kind) => void; counts: Record<Kind, number> }) {
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
          <span className="text-xs font-normal tabular-nums text-muted-foreground">{counts[k]}</span>
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

/** The list's last row: "+ קטגוריה חדשה", turning into a field in place */
function NewCategoryRow({ kind, onAdded }: { kind: Kind; onAdded: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (!name.trim()) return
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), kind }),
    })
    if (!res.ok) { setError('שם כבר קיים'); return }
    setName('')
    setError(null)
    onAdded()
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="flex h-[52px] w-full items-center gap-3.5 px-4 text-start text-[15px] text-primary transition-colors hover:bg-muted/40">
        <span className="flex h-3.5 w-3.5 items-center justify-center" aria-hidden><Plus className="h-4 w-4" /></span>
        קטגוריה חדשה
      </button>
    )
  }
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <input
        autoFocus
        aria-label={kind === 'INCOME' ? 'שם קטגוריית הכנסה חדשה' : 'שם קטגוריית הוצאה חדשה'}
        placeholder={kind === 'INCOME' ? 'שם קטגוריית הכנסה חדשה' : 'שם קטגוריית הוצאה חדשה'}
        className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-1.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') add()
          if (e.key === 'Escape') { setName(''); setError(null); setEditing(false) }
        }}
        onBlur={() => { if (!name.trim()) { setError(null); setEditing(false) } }}
      />
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}

function sourceText(s: CategorySource): { name: string; sub: string } {
  if (s.type === 'issuer') return { name: s.sourceCategory, sub: `קטגוריה של ${providerLabel(s.provider)} · ${s.count} עסקאות` }
  if (s.type === 'merchant') return { name: s.displayName, sub: `בית עסק · ${providerLabel(s.provider)}` }
  return { name: s.originalDescription, sub: `תיאור בבנק · ${providerLabel(s.provider)}` }
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
        : await fetch('/api/bank/category-rules', {
            method: 'DELETE',
            headers: json,
            body: JSON.stringify({ provider: s.provider, originalDescription: s.originalDescription, direction: s.direction }),
          })
  return res.ok
}

/** One category's window: its year, what fills it automatically, rename and delete */
function CategoryDetails({ category, kind, year, issuer, onChanged, onDeleted }: {
  category: CategoryItem
  kind: Kind
  year: string
  issuer: IssuerCategory[]
  onChanged: () => void
  onDeleted: () => void
}) {
  const { confirm, dialog } = useConfirm()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Issuer categories map to expense ones; the others it could take
  const addable = kind === 'EXPENSE' ? issuer.filter(r => r.category !== category.name) : []

  async function remove(s: CategorySource) {
    if (await removeSource(s)) onChanged()
    else setError('ההסרה נכשלה')
  }

  async function addIssuer(key: string) {
    const r = addable.find(x => `${x.provider}\u0000${x.sourceCategory}` === key)
    if (!r) return
    const res = await fetch('/api/category-mappings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: r.provider, sourceCategory: r.sourceCategory, category: category.name }),
    })
    if (res.ok) onChanged()
    else setError((await res.json().catch(() => null))?.error ?? 'השיוך נכשל')
  }

  async function rename() {
    if (!renaming?.trim() || renaming.trim() === category.name) { setRenaming(null); return }
    const res = await fetch(`/api/categories/${category.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renaming.trim() }),
    })
    if (!res.ok) { setError('שם כבר קיים'); return }
    setRenaming(null)
    setError(null)
    onChanged()
  }

  async function remove_() {
    if (!(await confirm({ title: <>למחוק את הקטגוריה <bdi>{category.name}</bdi>?</> }))) return
    await fetch(`/api/categories/${category.id}`, { method: 'DELETE' })
    onDeleted()
  }

  return (
    <div className="mt-1 space-y-5">
      <p className="text-sm text-muted-foreground">
        {kind === 'EXPENSE' ? 'קטגוריית הוצאה' : 'קטגוריית הכנסה'} · {year}:{' '}
        <span className="font-medium tabular-nums text-foreground">{category.total > 0 ? formatCurrencyWhole(category.total) : 'אין עדיין'}</span>
      </p>

      <section className="space-y-1.5">
        <h3 className="px-1 text-xs font-medium text-muted-foreground">מקבלת אוטומטית</h3>
        <ul className="overflow-hidden rounded-xl bg-muted/50 divide-y divide-border/60">
          {category.sources.map(s => {
            const t = sourceText(s)
            return (
              <li key={`${s.type}|${s.provider}|${t.name}`} className="flex min-h-[52px] items-center gap-3 px-3.5 py-1.5">
                <span className="min-w-0 flex-1">
                  <bdi className="block truncate text-[15px]">{t.name}</bdi>
                  <span className="block text-xs text-muted-foreground">{t.sub}</span>
                </span>
                <button
                  onClick={() => remove(s)}
                  aria-label={`הסר את ${t.name}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            )
          })}
          {category.sources.length === 0 && (
            <li className="px-3.5 py-3 text-sm text-muted-foreground">עוד אין מקור אוטומטי: כל תנועה בקטגוריה הזאת נבחרה ידנית.</li>
          )}
          {addable.length > 0 && (
            <li className="px-3.5 py-2">
              <select
                aria-label="שיוך קטגוריה של חברת אשראי"
                className="w-full bg-transparent py-1.5 text-[15px] text-primary focus:outline-none"
                value=""
                onChange={e => addIssuer(e.target.value)}
              >
                <option value="" disabled>+ שייך קטגוריה של חברת אשראי</option>
                {addable.map(r => (
                  <option key={`${r.provider}\u0000${r.sourceCategory}`} value={`${r.provider}\u0000${r.sourceCategory}`}>
                    {r.sourceCategory} · {providerLabel(r.provider)}
                    {r.category ? ` (עכשיו: ${r.category})` : ''}
                  </option>
                ))}
              </select>
            </li>
          )}
        </ul>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          בתי עסק ותיאורים בבנק נוספים מהטבלאות: בחירת קטגוריה לבית עסק, או &quot;כל התנועות&quot; בטבלת הבנק.
        </p>
      </section>

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
            onClick={remove_}
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
