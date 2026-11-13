'use client'

import { ChevronDown } from 'lucide-react'

/**
 * Under the sign-in card on phones (components/auth/auth-shell.tsx): a small
 * bobbing chevron that hints at the story below the fold and scrolls to it.
 * Instant under reduced motion, where it does not bob either.
 */
export function StoryChevron({ targetId }: { targetId: string }) {
  const go = () => {
    const target = document.getElementById(targetId)
    if (!target) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // scrollTo, not scrollIntoView: the page's scroll-padding (room for the sticky header) does not apply here
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 16, behavior: reduced ? 'auto' : 'smooth' })
    // Keyboard and screen reader users land there too, without a second jump
    target.focus({ preventScroll: true })
  }
  return (
    <button
      type="button"
      onClick={go}
      aria-label="עוד על תזרים"
      className="grid h-12 w-12 place-items-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDown className="auth-bob h-6 w-6" aria-hidden />
    </button>
  )
}
