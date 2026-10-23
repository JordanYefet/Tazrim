'use client'

import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { READ_ONLY_MESSAGE, isWriteBlocked } from '@/lib/read-only'

/** Thrown in place of a write's response, so the save stops where it is and nothing on screen changes */
class ReadOnlyError extends Error {
  constructor() {
    super(READ_ONLY_MESSAGE)
    this.name = 'ReadOnlyError'
  }
}

const NOTICE_MS = 3200

/**
 * Read-only mode in the browser (lib/read-only.ts; the server refuses the
 * same requests in middleware.ts). Writes to the API are stopped before they
 * are sent: the save throws, so components never show it as done (dialogs
 * stay open with what was typed), and a short notice explains why. Rendered
 * by the root layout only when the mode is on.
 */
export function ReadOnlyGuard() {
  const [notice, setNotice] = useState(0)

  useEffect(() => {
    const original = window.fetch
    window.fetch = (input, init) => {
      const request = input instanceof Request ? input : null
      const url = new URL(request?.url ?? String(input), window.location.href)
      const method = init?.method ?? request?.method ?? 'GET'
      if (url.origin === window.location.origin && isWriteBlocked(method, url.pathname)) {
        setNotice(n => n + 1)
        return Promise.reject(new ReadOnlyError())
      }
      return original(input, init)
    }
    // The stopped save is expected: keep it out of the console
    const quiet = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof ReadOnlyError) e.preventDefault()
    }
    window.addEventListener('unhandledrejection', quiet)
    return () => {
      window.fetch = original
      window.removeEventListener('unhandledrejection', quiet)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(0), NOTICE_MS)
    return () => clearTimeout(t)
  }, [notice])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5rem)] z-[60] flex justify-center px-4 md:bottom-6"
    >
      {notice > 0 && (
        <p
          key={notice}
          className="read-only-notice flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-e2 surface-overlay"
        >
          <Eye className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {READ_ONLY_MESSAGE}
        </p>
      )}
    </div>
  )
}

/** "דמו · קריאה בלבד": shown in the header while the mode is on */
export function ReadOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      <Eye className="h-3.5 w-3.5" aria-hidden />
      <span>
        דמו<span className="max-sm:hidden"> · קריאה בלבד</span>
      </span>
    </span>
  )
}
