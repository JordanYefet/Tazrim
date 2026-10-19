'use client'

import { useEffect, useState } from 'react'
import { CircleCheck, X } from 'lucide-react'

/**
 * "All data deleted" notice on the overview after Settings → delete all data
 * (ENG-62), which lands on /?deleted=1. The parameter is dropped from the
 * address right away, so a reload or a shared link doesn't show it again.
 */
export function DataDeletedNotice({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(show)

  useEffect(() => {
    if (!show) return
    const url = new URL(window.location.href)
    url.searchParams.delete('deleted')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [show])

  if (!visible) return null
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl surface-raised px-4 py-3 text-sm">
      <CircleCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 font-medium">כל הנתונים נמחקו</p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="סגירה"
        className="-me-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
