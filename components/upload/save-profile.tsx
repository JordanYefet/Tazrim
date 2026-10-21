'use client'

import { useId, useState } from 'react'
import { BookmarkPlus, CheckCircle2 } from 'lucide-react'
import type { ImportMapping } from '@/lib/import/mapping'

export interface SavedProfile {
  id: string
  name: string
}

/**
 * Offered after a file imported with a hand-made mapping: save it so the next
 * file with the same header is recognised and imported in one click. When the
 * mapping started from a saved profile, the profile can be updated instead.
 */
export function SaveProfile({
  accountId,
  accountName,
  defaultName,
  mapping,
  headerSignature,
  basedOn,
  onSaved,
  onDismiss,
}: {
  accountId: string
  accountName: string
  defaultName: string
  mapping: ImportMapping
  headerSignature: string
  basedOn: SavedProfile | null
  onSaved: (profile: SavedProfile) => void
  onDismiss: () => void
}) {
  const id = useId()
  const [name, setName] = useState(basedOn?.name ?? defaultName)
  const [link, setLink] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(url: string, method: 'POST' | 'PATCH', body: object) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'שמירת המיפוי נכשלה')
        return
      }
      onSaved({ id: data.id, name: data.name })
    } catch {
      setError('שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving || !name.trim()) return
    if (basedOn) {
      void send(`/api/import-profiles/${basedOn.id}`, 'PATCH', { name, mapping, headerSignature })
    } else {
      void send('/api/import-profiles', 'POST', { accountId, name, mapping, headerSignature, linkAccount: link })
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-lg border bg-muted/30 p-3 sm:p-4" aria-labelledby={`${id}-title`}>
      <div className="flex items-start gap-2">
        <BookmarkPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p id={`${id}-title`} className="text-sm font-medium">
            {basedOn ? 'לעדכן את המיפוי השמור?' : 'לשמור את המיפוי?'}
          </p>
          <p className="text-xs text-muted-foreground">
            קובץ הבא עם אותן כותרות יזוהה לבד, ויספיק ללחוץ על ייבוא.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={`${id}-name`} className="sr-only">שם המיפוי</label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={80}
          className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-quick ease-out hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50"
          >
            {saving ? 'שומר...' : basedOn ? 'עדכן מיפוי' : 'שמור מיפוי'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={saving}
            className="h-9 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            לא עכשיו
          </button>
        </div>
      </div>
      {!basedOn && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={link} onChange={e => setLink(e.target.checked)} className="accent-[hsl(var(--primary))]" />
          מיפוי ברירת המחדל של {accountName}
        </label>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  )
}

export function SavedProfileNote({ name }: { name: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      המיפוי &quot;{name}&quot; נשמר. קבצים הבאים עם אותן כותרות יזוהו לבד.
    </p>
  )
}
