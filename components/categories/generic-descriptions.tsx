'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'

/**
 * Bank descriptions that only say how money moved (lib/db/generic-descriptions.ts).
 * Adding one drops its category rules; removing one recategorises nothing.
 */
export function GenericDescriptions({ initial }: { initial: string[] }) {
  const [descriptions, setDescriptions] = useState(initial)
  const [newText, setNewText] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (!newText.trim()) return
    const res = await fetch('/api/bank/generic-descriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newText }),
    })
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'ההוספה נכשלה'); return }
    const { description } = (await res.json()) as { description: string }
    setDescriptions(prev => (prev.includes(description) ? prev : [...prev, description].sort((a, b) => a.localeCompare(b))))
    setNewText('')
    setError(null)
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
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="border rounded-lg px-3 py-2 text-sm bg-background flex-1 focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="תיאור כפי שהוא מופיע בקובץ הבנק"
          value={newText}
          onChange={e => setNewText(e.target.value)}
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

      {descriptions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {descriptions.map(d => (
            <div key={d} className="group flex items-center gap-1.5 bg-muted hover:bg-muted/70 rounded-lg px-3 py-1.5 text-sm transition-colors">
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
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4">אין תיאורים כלליים</p>
      )}
    </div>
  )
}
