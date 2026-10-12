'use client'

import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { RollingNumber } from '@/components/ui/rolling-number'

const SOURCES = [
  { value: 'BANK', label: 'בנק לאומי' },
  { value: 'MAX', label: 'מקס כרטיס אשראי' },
]

interface UploadResult {
  created: number
  skipped: number
  newCategories?: string[]
}

export function UploadZone({ onSuccess }: { onSuccess: () => void }) {
  const [source, setSource] = useState('BANK')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingCategories, setPendingCategories] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [categoryLoading, setCategoryLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setLoading(true)
    setResult(null)
    setError(null)
    setPendingCategories([])
    setSelectedCategories(new Set())

    const form = new FormData()
    form.append('file', file)
    form.append('source', source)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה בהעלאה'); return }
      setResult(data)
      onSuccess()
      if (source === 'MAX' && data.newCategories?.length) {
        setPendingCategories(data.newCategories)
        setSelectedCategories(new Set(data.newCategories))
      }
    } catch {
      setError('שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  function toggleCategory(name: string) {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function addSelectedCategories() {
    setCategoryLoading(true)
    try {
      await Promise.all([...selectedCategories].map(name =>
        fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
      ))
      setPendingCategories([])
    } catch {
      setError('שגיאה בהוספת קטגוריות')
    } finally {
      setCategoryLoading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }

  return (
    <div className="space-y-4">
      {/* Source pill toggle */}
      <div className="flex bg-muted rounded-lg p-1 gap-1">
        {SOURCES.map(s => (
          <button
            key={s.value}
            onClick={() => setSource(s.value)}
            className={cn(
              'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all',
              source === s.value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all flex flex-col items-center gap-3',
          dragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
        )}
      >
        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
          dragging ? 'bg-primary/15' : 'bg-muted'
        )}>
          <Upload className={cn('h-5 w-5 transition-colors', dragging ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">גרור קובץ לכאן</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {source === 'BANK' ? '.xls — בנק לאומי' : '.xlsx — מקס'}
          </p>
        </div>
        <button
          type="button"
          className="mt-1 px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
        >
          בחר קובץ
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xls,.xlsx"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          מעלה קובץ...
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
      )}
      {result && (
        <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-primary/10 border border-primary/20">
          <span className="text-primary font-semibold">
            <RollingNumber value={result.created} format="integer" /> עסקאות חדשות נוספו
          </span>
          {result.skipped > 0 && (
            <span className="text-muted-foreground">
              · <RollingNumber value={result.skipped} format="integer" /> כפולות דולגו
            </span>
          )}
        </div>
      )}

      {pendingCategories.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
          <div>
            <p className="font-semibold">נמצאו קטגוריות חדשות בקובץ</p>
            <p className="text-muted-foreground text-xs mt-0.5">בחר אילו קטגוריות להוסיף לרשימה שלך:</p>
          </div>
          <div className="flex flex-col gap-2">
            {pendingCategories.map(name => (
              <label key={name} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCategories.has(name)}
                  onChange={() => toggleCategory(name)}
                  className="accent-primary w-4 h-4"
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={addSelectedCategories}
              disabled={categoryLoading || selectedCategories.size === 0}
              className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {categoryLoading ? 'מוסיף...' : 'הוסף נבחרים'}
            </button>
            <button
              onClick={() => setPendingCategories([])}
              className="border px-4 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              דלג
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
