'use client'

import { useState } from 'react'
import { providerLabel } from '@/lib/accounts/brands'
import type { IssuerCategory } from '@/lib/db/category-mappings'

interface Category { id: string; name: string }

const nf = new Intl.NumberFormat('he-IL')

/**
 * The categories card issuers' files brought, each mapped to one of yours (ENG-75).
 * Choosing the issuer's own name removes the mapping.
 */
export function IssuerCategories({ initial, categories }: { initial: IssuerCategory[]; categories: Category[] }) {
  const [rows, setRows] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  async function save(row: IssuerCategory, category: string) {
    setError(null)
    const unmap = category === row.sourceCategory
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

  if (!rows.length) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        עוד לא הועלו קבצים של כרטיסי אשראי עם קטגוריות.
      </div>
    )
  }

  const names = new Set(categories.map(c => c.name))

  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {['קטגוריה בקובץ', 'חברה', 'עסקאות', 'הקטגוריה שלך'].map(h => (
                  <th key={h} className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.provider}\u0000${row.sourceCategory}`} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-4 font-medium"><bdi>{row.sourceCategory}</bdi></td>
                  <td className="py-2.5 px-4 text-muted-foreground text-xs">{providerLabel(row.provider)}</td>
                  <td className="py-2.5 px-4 text-muted-foreground text-xs tabular-nums">{nf.format(row.count)}</td>
                  <td className="py-2.5 px-4">
                    <select
                      className="text-xs"
                      aria-label={`הקטגוריה שלך עבור ${row.sourceCategory}`}
                      value={row.category ?? row.sourceCategory}
                      onChange={e => save(row, e.target.value)}
                    >
                      {!names.has(row.sourceCategory) && (
                        <option value={row.sourceCategory}>{row.sourceCategory} (השם מהקובץ)</option>
                      )}
                      {categories.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
