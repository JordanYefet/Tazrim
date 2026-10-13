'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { OPEN_SEARCH_EVENT } from './command-search'

const box =
  'flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-muted text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Header search: on phones a link to /search, on md+ a button that opens the
 * ⌘K dialog (with the shortcut hint, which is filled in after mount).
 */
export function SearchButton() {
  const [shortcut, setShortcut] = useState('')
  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K')
  }, [])

  return (
    <>
      <Link href="/search" aria-label="חיפוש" title="חיפוש" className={cn(box, 'w-8 md:hidden')}>
        <Search className="h-4 w-4" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
        aria-label="חיפוש תנועות"
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(box, 'hidden px-2.5 text-sm md:flex')}
      >
        <Search className="h-4 w-4" aria-hidden />
        <span>חיפוש</span>
        <kbd className="min-w-[2.6rem] rounded border bg-card px-1 text-[10px] leading-4" dir="ltr">
          {shortcut}
        </kbd>
      </button>
    </>
  )
}
