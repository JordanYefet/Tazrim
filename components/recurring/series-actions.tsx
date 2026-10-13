'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, EyeOff, Pencil, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface SeriesActionsProps {
  seriesKey: string
  baseKey: string
  accountId: string | null
  overrideKey: string | null
  status: 'confirmed' | 'dismissed' | null
  name: string
  detectedName: string
}

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

/** Confirm / dismiss / rename controls for one recurring series. Saves, then refreshes the server page. */
export function SeriesActions({ seriesKey, baseKey, accountId, overrideKey, status, name, detectedName }: SeriesActionsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState(false)

  async function save(patch: { status?: SeriesActionsProps['status']; displayName?: string | null }) {
    setError(false)
    const res = await fetch('/api/recurring/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: seriesKey, baseKey, accountId, overrideKey, ...patch }),
    })
    if (!res.ok) { setError(true); return }
    startTransition(() => router.refresh())
  }

  function submitRename() {
    if (editing === null) return
    const value = editing.trim()
    setEditing(null)
    if (value === name) return
    save({ displayName: value && value !== detectedName ? value : null })
  }

  if (editing !== null) {
    return (
      <form
        className="flex w-full items-center gap-1 sm:w-auto"
        onSubmit={e => { e.preventDefault(); submitRename() }}
      >
        <input
          autoFocus
          aria-label="שם חדש"
          placeholder={detectedName}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-44"
          value={editing}
          onChange={e => setEditing(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setEditing(null) }}
        />
        <button type="submit" className={iconButton} aria-label="שמור שם">
          <Check className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className={iconButton} aria-label="בטל עריכה" onClick={() => setEditing(null)}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-0.5" aria-busy={pending}>
      {error && <span className="me-1 text-xs text-[hsl(var(--expense))]">השמירה נכשלה</span>}
      {status === 'dismissed' ? (
        <button
          type="button"
          className={cn(iconButton, 'w-auto gap-1 px-2 text-xs')}
          disabled={pending}
          onClick={() => save({ status: null })}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          שחזר
        </button>
      ) : (
        <>
          <button
            type="button"
            className={cn(iconButton, status === 'confirmed' && 'bg-[hsl(var(--income)/0.12)] text-[hsl(var(--income))]')}
            aria-label={status === 'confirmed' ? 'בטל אישור' : 'אשר שזה חיוב קבוע'}
            aria-pressed={status === 'confirmed'}
            title={status === 'confirmed' ? 'בטל אישור' : 'אשר'}
            disabled={pending}
            onClick={() => save({ status: status === 'confirmed' ? null : 'confirmed' })}
          >
            <Check className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label="הסתר — זה לא חיוב קבוע"
            title="הסתר"
            disabled={pending}
            onClick={() => save({ status: 'dismissed' })}
          >
            <EyeOff className="h-4 w-4" aria-hidden />
          </button>
        </>
      )}
      <button
        type="button"
        className={iconButton}
        aria-label="שנה שם"
        title="שנה שם"
        disabled={pending}
        onClick={() => setEditing(name)}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
