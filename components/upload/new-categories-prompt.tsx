'use client'

import { useEffect, useState } from 'react'

export const ADD = '\u0000add'
export const SKIP = '\u0000skip'

/** What to save for the choices: categories to add to the list, and mappings to one of yours. */
export function planCategoryChoices(categories: string[], choice: Record<string, string>) {
  return {
    add: categories.filter(c => choice[c] === ADD),
    map: categories
      .filter(c => choice[c] && choice[c] !== ADD && choice[c] !== SKIP)
      .map(sourceCategory => ({ sourceCategory, category: choice[sourceCategory] })),
  }
}

/**
 * After a card import: for each of the file's unknown categories, add it to the
 * category list, map it to one of yours (ENG-75, for every file of this provider),
 * or leave it for now.
 */
export function NewCategoriesPrompt({
  categories,
  provider,
  severalFiles = false,
  onDone,
}: {
  categories: string[]
  /** The account's provider: a mapping applies to all its cards */
  provider: string
  /** the categories were merged from several files' imports */
  severalFiles?: boolean
  onDone: () => void
}) {
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(categories.map(c => [c, ADD])))
  const [yours, setYours] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/categories?kind=EXPENSE')
      .then(r => (r.ok ? r.json() : []))
      .then((list: { name: string }[]) => setYours(list.map(c => c.name)))
      .catch(() => {})
  }, [])

  const plan = planCategoryChoices(categories, choice)

  async function apply() {
    setLoading(true)
    setError(null)
    try {
      // New categories first, so nothing is mapped to a name that isn't in the list yet
      const added = await Promise.all(plan.add.map(name =>
        fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
      ))
      const mapped = await Promise.all(plan.map.map(({ sourceCategory, category }) =>
        fetch('/api/category-mappings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, sourceCategory, category }),
        })
      ))
      if ([...added, ...mapped].some(r => !r.ok)) throw new Error()
      onDone()
    } catch {
      setError('שגיאה בשמירת הקטגוריות')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
      <div>
        <p className="font-semibold">{severalFiles ? 'נמצאו קטגוריות חדשות בקבצים' : 'נמצאו קטגוריות חדשות בקובץ'}</p>
        <p className="text-muted-foreground text-xs mt-0.5">
          לכל אחת: להוסיף לרשימה שלך, או לשייך לקטגוריה שכבר יש לך (גם בקבצים הבאים של אותה חברה).
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {categories.map(name => (
          <label key={name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <bdi className="font-medium">{name}</bdi>
            <select
              className="text-xs max-w-full"
              aria-label={`מה לעשות עם ${name}`}
              value={choice[name]}
              onChange={e => setChoice(prev => ({ ...prev, [name]: e.target.value }))}
            >
              <option value={ADD}>להוסיף כקטגוריה חדשה</option>
              {yours.length > 0 && (
                <optgroup label="לשייך ל:">
                  {yours.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              )}
              <option value={SKIP}>לא עכשיו</option>
            </select>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={apply}
          disabled={loading || plan.add.length + plan.map.length === 0}
          className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {loading ? 'שומר...' : 'שמור'}
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
