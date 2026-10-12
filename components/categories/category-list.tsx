'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface Category { id: string; name: string }

export function CategoryList({ initial }: { initial: Category[] }) {
  const [categories, setCategories] = useState(initial)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (!newName.trim()) return
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    if (!res.ok) { setError('שם כבר קיים'); return }
    const cat = await res.json()
    setCategories(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
    setNewName('')
    setError(null)
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

  async function remove(id: string) {
    await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Add input */}
      <div className="flex gap-2">
        <input
          className="border rounded-lg px-3 py-2 text-sm bg-background flex-1 focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="שם קטגוריה חדשה"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button
          onClick={add}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          הוסף
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Chips grid */}
      {categories.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <div
              key={cat.id}
              className="group flex items-center gap-1.5 bg-muted hover:bg-muted/70 rounded-lg px-3 py-1.5 text-sm transition-colors"
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
                onClick={() => remove(cat.id)}
                className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                aria-label="מחק קטגוריה"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4">אין קטגוריות עדיין</p>
      )}
    </div>
  )
}
