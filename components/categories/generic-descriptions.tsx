'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { AddChip } from '@/components/categories/add-chip'

/**
 * Bank descriptions that only say how money moved (lib/db/generic-descriptions.ts).
 * Adding one drops its category rules; removing one recategorises nothing.
 */
export function GenericDescriptions({ initial }: { initial: string[] }) {
  const [descriptions, setDescriptions] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  async function add(text: string) {
    const res = await fetch('/api/bank/generic-descriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: text }),
    })
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'ההוספה נכשלה'); return false }
    const { description } = (await res.json()) as { description: string }
    setDescriptions(prev => (prev.includes(description) ? prev : [...prev, description].sort((a, b) => a.localeCompare(b))))
    setError(null)
    return true
  }

  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(d: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (!next.delete(d)) next.add(d)
      return next
    })
  }

  async function removeSelected() {
    for (const description of selected) {
      const res = await fetch('/api/bank/generic-descriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'ההסרה נכשלה'); return }
      setDescriptions(prev => prev.filter(d => d !== description))
      setSelected(prev => { const next = new Set(prev); next.delete(description); return next })
    }
    setError(null)
  }

  return (
    <div className="space-y-3">
      {/* Tapping a description selects it; the remove button below acts on the selection */}
      <div className="flex flex-wrap gap-2">
        {descriptions.map(d => {
          const on = selected.has(d)
          return (
            <button
              key={d}
              aria-pressed={on}
              onClick={() => toggle(d)}
              className={cn(
                'inline-flex h-9 items-center justify-center rounded-full px-4 text-sm transition-[background-color,box-shadow,transform] duration-fast active:scale-[0.97]',
                on ? 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/40' : 'bg-muted hover:bg-muted/70'
              )}
            >
              <bdi>{d}</bdi>
            </button>
          )
        })}
        <AddChip label="הוסף תיאור" placeholder="תיאור כפי שהוא מופיע בקובץ הבנק" onAdd={add} />
      </div>
      {selected.size > 0 && (
        <div className="flex gap-2">
          <button
            onClick={removeSelected}
            className="h-10 flex-1 rounded-xl bg-destructive/10 text-sm font-medium text-destructive transition-[background-color,transform] hover:bg-destructive/15 active:scale-[0.97]"
          >
            {selected.size === 1 ? `הסר את "${[...selected][0]}"` : `הסר ${selected.size} תיאורים`}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="h-10 rounded-xl bg-muted px-4 text-sm transition-[background-color,transform] hover:bg-muted/70 active:scale-[0.97]"
          >
            ביטול
          </button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
