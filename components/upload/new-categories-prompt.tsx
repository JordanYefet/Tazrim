'use client'

import { useState } from 'react'

/** After a card import: offer to add the file's unknown categories to the category list. */
export function NewCategoriesPrompt({ categories, onDone }: { categories: string[]; onDone: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(categories))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(name: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function addSelected() {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([...selected].map(name =>
        fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
      ))
      onDone()
    } catch {
      setError('שגיאה בהוספת קטגוריות')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
      <div>
        <p className="font-semibold">נמצאו קטגוריות חדשות בקובץ</p>
        <p className="text-muted-foreground text-xs mt-0.5">בחר אילו קטגוריות להוסיף לרשימה שלך:</p>
      </div>
      <div className="flex flex-col gap-2">
        {categories.map(name => (
          <label key={name} className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(name)}
              onChange={() => toggle(name)}
              className="accent-primary w-4 h-4"
            />
            <span>{name}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={addSelected}
          disabled={loading || selected.size === 0}
          className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {loading ? 'מוסיף...' : 'הוסף נבחרים'}
        </button>
        <button
          onClick={onDone}
          className="border px-4 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          דלג
        </button>
      </div>
    </div>
  )
}
