'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
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

  async function remove(description: string) {
    const res = await fetch('/api/bank/generic-descriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    })
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'ההסרה נכשלה'); return }
    setDescriptions(prev => prev.filter(d => d !== description))
    setError(null)
  }

  return (
    <div className="space-y-2">
      {/* The descriptions, then "+ הוסף תיאור" turning into a field in place */}
      <div className="flex flex-wrap gap-2">
        {descriptions.map(d => (
          <div key={d} className="group flex items-center gap-1.5 bg-muted hover:bg-muted/70 rounded-full px-3 py-1.5 text-sm transition-colors">
            <bdi>{d}</bdi>
            <button
              onClick={() => remove(d)}
              className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`הסר את ${d}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <AddChip label="הוסף תיאור" placeholder="תיאור כפי שהוא מופיע בקובץ הבנק" onAdd={add} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
