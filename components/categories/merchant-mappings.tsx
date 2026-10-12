'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface Alias {
  id: string
  source: string
  originalName: string
  displayName: string
  categoryOverride: string | null
}

interface Category { id: string; name: string }

const SOURCE_LABELS: Record<string, string> = { BANK: 'בנק לאומי', MAX: 'מקס', HITECH: 'הייטקזון' }

export function MerchantMappings({ initial, categories }: { initial: Alias[]; categories: Category[] }) {
  const [aliases, setAliases] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDisplay, setEditDisplay] = useState('')

  async function saveDisplayName(alias: Alias) {
    await fetch('/api/aliases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: alias.source,
        originalName: alias.originalName,
        displayName: editDisplay,
        categoryOverride: alias.categoryOverride,
      }),
    })
    setAliases(prev => prev.map(a => a.id === alias.id ? { ...a, displayName: editDisplay } : a))
    setEditingId(null)
  }

  async function saveCategory(alias: Alias, categoryOverride: string) {
    await fetch('/api/aliases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: alias.source,
        originalName: alias.originalName,
        displayName: alias.displayName,
        categoryOverride,
      }),
    })
    setAliases(prev => prev.map(a => a.id === alias.id ? { ...a, categoryOverride } : a))
  }

  async function deleteAliasRow(alias: Alias) {
    if (!window.confirm(`למחוק את המיפוי של "${alias.originalName}"?`)) return
    await fetch(`/api/aliases/${alias.id}`, { method: 'DELETE' })
    setAliases(prev => prev.filter(a => a.id !== alias.id))
  }

  if (!aliases.length) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        לא קיימים מיפויים עדיין. העלה קבצים כדי להתחיל.
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {['שם מקורי', 'שם תצוגה', 'קטגוריה', 'מקור', ''].map((h, i) => (
                <th key={i} className="text-right py-2.5 px-4 font-medium text-xs text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aliases.map(alias => (
              <tr key={alias.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="py-2.5 px-4 text-muted-foreground font-mono text-xs">{alias.originalName}</td>
                <td className="py-2.5 px-4 font-medium">
                  {editingId === alias.id ? (
                    <input
                      autoFocus
                      className="border rounded-md px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring w-full"
                      value={editDisplay}
                      onChange={e => setEditDisplay(e.target.value)}
                      onBlur={() => saveDisplayName(alias)}
                      onKeyDown={e => { if (e.key === 'Enter') saveDisplayName(alias); if (e.key === 'Escape') setEditingId(null) }}
                    />
                  ) : (
                    <span
                      className="cursor-pointer hover:text-primary transition-colors"
                      onClick={() => { setEditingId(alias.id); setEditDisplay(alias.displayName) }}
                    >
                      {alias.displayName}
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-4">
                  <select
                    className="text-xs"
                    value={alias.categoryOverride ?? ''}
                    onChange={e => saveCategory(alias, e.target.value)}
                  >
                    <option value="">— ללא —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 px-4 text-muted-foreground text-xs">{SOURCE_LABELS[alias.source] ?? alias.source}</td>
                <td className="py-2.5 px-4 text-center">
                  <button
                    onClick={() => deleteAliasRow(alias)}
                    aria-label="מחק מיפוי"
                    className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
