'use client'

import { useState } from 'react'
import { UnusualList } from '@/components/insights/unusual-list'
import type { UnusualTransaction } from '@/lib/insights/unusual'

interface Props {
  items: UnusualTransaction[]
  subtitle: string
}

const LIMIT = 5

async function send(method: 'POST' | 'DELETE', item: UnusualTransaction) {
  const res = await fetch('/api/insights/unusual/dismissals', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: item.source, transactionId: item.id, reason: item.flags[0]?.reason }),
  })
  if (!res.ok) throw new Error(`dismissal ${method} failed`)
}

/** Dashboard "worth a look" card: dismiss persists, with a one-step undo */
export function UnusualCard({ items: initial, subtitle }: Props) {
  const [items, setItems] = useState(initial)
  const [expanded, setExpanded] = useState(false)
  const [undo, setUndo] = useState<{ item: UnusualTransaction; index: number } | null>(null)
  const [error, setError] = useState(false)

  async function dismiss(item: UnusualTransaction) {
    const index = items.indexOf(item)
    setItems(prev => prev.filter(i => i !== item))
    setUndo({ item, index })
    setError(false)
    try {
      await send('POST', item)
    } catch {
      setItems(prev => [...prev.slice(0, index), item, ...prev.slice(index)])
      setUndo(null)
      setError(true)
    }
  }

  async function restore() {
    if (!undo) return
    const { item, index } = undo
    setUndo(null)
    setItems(prev => [...prev.slice(0, index), item, ...prev.slice(index)])
    try {
      await send('DELETE', item)
    } catch {
      setItems(prev => prev.filter(i => i !== item))
      setError(true)
    }
  }

  const hidden = items.length - LIMIT
  const footer =
    undo || error || hidden > 0 ? (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        {undo ? (
          <span className="text-muted-foreground">
            סומן כלא חריג ·{' '}
            <button type="button" onClick={restore} className="font-medium text-primary hover:underline">
              ביטול
            </button>
          </span>
        ) : error ? (
          <span className="text-[hsl(var(--expense))]">השמירה נכשלה, נסה שוב.</span>
        ) : (
          <span />
        )}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="font-medium text-primary hover:underline"
          >
            {expanded ? 'הצג פחות' : `הצג את כולן (${items.length})`}
          </button>
        )}
      </div>
    ) : null

  return (
    <UnusualList
      title="שווה בדיקה"
      subtitle={subtitle}
      items={items}
      limit={expanded ? undefined : LIMIT}
      onDismiss={dismiss}
      footer={footer}
    />
  )
}
