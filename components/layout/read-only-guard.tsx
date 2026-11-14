'use client'

import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { READ_ONLY_MESSAGE, UPDATING_MESSAGE, isWriteBlocked } from '@/lib/read-only'

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
 * stay open with what was typed), and a short notice explains why. The root
 * layout always renders it, with `readOnly` saying whether the mode is on.
 *
 * It also explains a write the server paused during an update (ENG-98): the
 * response says `updating: true`, the notice shows the update message, and the
 * response goes on to the caller as an ordinary 403.
 */
export function ReadOnlyGuard({ readOnly = true }: { readOnly?: boolean } = {}) {
  const [notice, setNotice] = useState(0)
  const [message, setMessage] = useState(READ_ONLY_MESSAGE)

  useEffect(() => {
    const original = window.fetch
    window.fetch = (input, init) => {
      const request = input instanceof Request ? input : null
      const url = new URL(request?.url ?? String(input), window.location.href)
      const method = init?.method ?? request?.method ?? 'GET'
      const sameOrigin = url.origin === window.location.origin
      if (readOnly && sameOrigin && isWriteBlocked(method, url.pathname)) {
        setMessage(READ_ONLY_MESSAGE)
        setNotice(n => n + 1)
        return Promise.reject(new ReadOnlyError())
      }
      const sent = original(input, init)
      if (!sameOrigin || !isWriteBlocked(method, url.pathname)) return sent
      return sent.then(res => {
        if (res.status === 403) {
          res
            .clone()
            .json()
            .then((b: { updating?: boolean }) => {
              if (b?.updating) {
                setMessage(UPDATING_MESSAGE)
                setNotice(n => n + 1)
              }
            })
            .catch(() => {})
        }
        return res
      })
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
  }, [readOnly])

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
          {message}
        </p>
      )}
    </div>
  )
}

/** "דמו · קריאה בלבד": shown in the header while the mode is on */
export function ReadOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary max-[379px]:px-1.5">
      <Eye className="h-3.5 w-3.5" aria-hidden />
      {/* The narrowest phones show the eye only: the header's middle (the period picker) needs the room */}
      <span className="max-[379px]:sr-only">
        דמו<span className="max-sm:hidden"> · קריאה בלבד</span>
      </span>
    </span>
  )
}
