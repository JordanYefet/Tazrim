'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { AddChip } from '@/components/categories/add-chip'

interface Category { id: string; name: string }

/** The categories of one kind: expense ones (cards and bank debits) or income ones (bank credits). */
export function CategoryList({ initial, kind = 'EXPENSE' }: { initial: Category[]; kind?: 'EXPENSE' | 'INCOME' }) {
  const [categories, setCategories] = useState(initial)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  async function add(name: string) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, kind }),
    })
    if (!res.ok) { setError('שם כבר קיים'); return false }
    const cat = await res.json()
    setCategories(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
    setError(null)
    return true
  }

  async function save() {
    if (!editing) return
    const res = await fetch(`/api/categories/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editing.name }),
    })
    if (!res.ok) { setError('שם כבר קיים'); return }
    const updated = await res.json()
    setCategories(prev => prev.map(c => c.id === updated.id ? updated : c).sort((a, b) => a.name.localeCompare(b.name)))
    setEditing(null)
    setError(null)
  }

  async function remove(cat: Category) {
    if (!(await confirm({ title: <>למחוק את הקטגוריה <bdi>{cat.name}</bdi>?</> }))) return
    await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' })
    setCategories(prev => prev.filter(c => c.id !== cat.id))
  }

  return (
    <>
      <div className="space-y-2">
        {/* The chips, then "+ חדשה" turning into a field in place */}
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <div
              key={cat.id}
              className="group flex items-center gap-1.5 bg-muted hover:bg-muted/70 rounded-full px-3 py-1.5 text-sm transition-colors"
            >
              {editing?.id === cat.id ? (
                <input
                  autoFocus
                  className="border rounded px-1.5 py-0.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring w-24"
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  onBlur={save}
                  onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(null) }}
                />
              ) : (
                <span
                  className="cursor-pointer hover:text-primary transition-colors"
                  onClick={() => setEditing({ id: cat.id, name: cat.name })}
                >
                  {cat.name}
                </span>
              )}
              <button
                onClick={() => remove(cat)}
                className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="מחק קטגוריה"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <AddChip
            label="חדשה"
            placeholder={kind === 'INCOME' ? 'שם קטגוריית הכנסה חדשה' : 'שם קטגוריה חדשה'}
            onAdd={add}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      {dialog}
    </>
  )
}
