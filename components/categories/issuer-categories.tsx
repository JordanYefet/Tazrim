'use client'

import { useState } from 'react'
import { providerLabel } from '@/lib/accounts/brands'
import type { IssuerCategory } from '@/lib/db/category-mappings'
import { CategoryPicker, CategoryPill } from './category-picker'

interface Category { id: string; name: string }

const nf = new Intl.NumberFormat('he-IL')

/**
 * The categories card issuers' files brought, each mapped to one of yours (ENG-75):
 * a row per issuer category whose pill opens the category window, as in the tables.
 * "ללא קטגוריה" removes the mapping (the rows show the issuer's name again).
 */
export function IssuerCategories({ initial, categories, colors = {} }: {
  initial: IssuerCategory[]
  categories: Category[]
  /** Each category's chart colour */
  colors?: Record<string, string>
}) {
  const [rows, setRows] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<IssuerCategory | null>(null)
  // The last row stays while the window animates out
  const [last, setLast] = useState<IssuerCategory | null>(null)
  if (picking && picking !== last) setLast(picking)
  const shown = picking ?? last

  async function save(row: IssuerCategory, category: string | null) {
    setError(null)
    const unmap = category === null || category === row.sourceCategory
    const res = await fetch('/api/category-mappings', {
      method: unmap ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: row.provider, sourceCategory: row.sourceCategory, category }),
    })
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? 'שגיאה בשמירת המיפוי')
      return
    }
    setRows(prev => prev.map(r =>
      r.provider === row.provider && r.sourceCategory === row.sourceCategory ? { ...r, category: unmap ? null : category } : r
    ))
  }

  // An unmapped issuer category named like one of yours already shows that category
  const names = new Set(categories.map(c => c.name))
  const effective = (row: IssuerCategory) => row.category ?? (names.has(row.sourceCategory) ? row.sourceCategory : null)

  if (!rows.length) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        עוד לא הועלו קבצים של כרטיסי אשראי עם קטגוריות.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="overflow-hidden rounded-xl bg-muted/40 divide-y divide-border/60">
        {rows.map(row => (
          <li key={`${row.provider}\u0000${row.sourceCategory}`} className="flex min-h-[56px] items-center gap-3 px-3.5 py-2">
            <span className="min-w-0 flex-1">
              <bdi className="block truncate text-[15px] font-medium">{row.sourceCategory}</bdi>
              <span className="block text-xs text-muted-foreground">
                {providerLabel(row.provider)} · {nf.format(row.count)} עסקאות
              </span>
            </span>
            <CategoryPill
              name={effective(row)}
              color={effective(row) ? colors[effective(row)!] : undefined}
              onClick={() => setPicking(row)}
            />
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <CategoryPicker
        open={!!picking}
        onOpenChange={o => !o && setPicking(null)}
        context={shown ? `קטגוריה בקובץ של ${providerLabel(shown.provider)} · ${nf.format(shown.count)} עסקאות` : ''}
        title={shown?.sourceCategory ?? ''}
        amount=""
        amountTone="expense"
        categories={categories.map(c => ({ name: c.name, color: colors[c.name] }))}
        createKind="EXPENSE"
        current={shown ? effective(shown) : null}
        allowNone
        note="הבחירה חלה על כל העסקאות בקטגוריה הזאת בקבצים של החברה, גם בקבצים הבאים."
        onSave={async category => {
          if (!shown) return
          setPicking(null)
          await save(shown, category)
        }}
      />
    </div>
  )
}
