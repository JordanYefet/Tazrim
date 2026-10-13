'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileWarning, X } from 'lucide-react'
import { providerLabel } from '@/components/upload/account-picker'
import { missingStatementMessage, type MissingStatement } from '@/lib/insights/missing-statements'

export type MissingStatementItem = Pick<MissingStatement, 'kind' | 'provider' | 'months'>

// Dismissed for this browser session only (sessionStorage), and only for this
// exact set of gaps: a new missing month brings the notice back.
const STORAGE_KEY = 'tazrim:missing-statements-dismissed'
const signature = (items: MissingStatementItem[]) =>
  items.map(i => `${i.kind}|${i.provider}|${i.months.join(',')}`).join(';')

/** Compact dashboard notice: which statements are missing, with a link to /upload */
export function MissingStatementsBanner({ items }: { items: MissingStatementItem[] }) {
  const [dismissed, setDismissed] = useState(false)
  const sig = signature(items)

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(STORAGE_KEY) === sig)
    } catch {
      // storage unavailable: the notice just stays until dismissed
    }
  }, [sig])

  if (!items.length || dismissed) return null

  function dismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(STORAGE_KEY, sig)
    } catch {
      // ignore
    }
  }

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm"
    >
      <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        {items.map(i => (
          <p key={`${i.kind}|${i.provider}`} className="text-pretty">
            {missingStatementMessage(i.kind, providerLabel(i.provider), i.months)}
          </p>
        ))}
      </div>
      <Link
        href="/upload"
        className="shrink-0 rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        להעלאה
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="הסתרת ההתראה"
        title="הסתרה עד סוף הביקור"
        className="-m-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
