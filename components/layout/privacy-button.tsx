'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { cookieAssignment } from '@/lib/nav/state'
import { PRIVACY_COOKIE, formatPrivacyCookie, isPrivacyShortcut } from '@/lib/privacy'

// How long <html data-privacy-switch> stays on, so the blur eases in or out (globals.css)
const SWITCH_MS = 400

/**
 * Privacy mode (ENG-127, lib/privacy.ts): the eye in the header blurs every amount.
 * A tap eases the blur in or out; the keyboard shortcut and reduced motion switch at
 * once. While on, the button is tinted, which is also the sign that amounts are hidden.
 */
export function PrivacyButton({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [shortcut, setShortcut] = useState('')

  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘⇧.' : 'Ctrl+Shift+.')
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isPrivacyShortcut(e)) return
      e.preventDefault()
      setOn(o => apply(!o, false))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const label = on ? 'הצגת הסכומים' : 'הסתרת הסכומים'
  return (
    <button
      type="button"
      onClick={() => setOn(apply(!on, true))}
      aria-pressed={on}
      aria-label={label}
      aria-keyshortcuts="Meta+Shift+Period Control+Shift+Period"
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        // 36px, like the search button and the avatar beside it
        'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'before:absolute before:-inset-1 before:content-[""]',
        on ? 'border-primary/30 bg-primary/15 text-primary' : 'border-border bg-muted text-muted-foreground hover:text-foreground'
      )}
    >
      {on ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
    </button>
  )
}

/** Sets the mode on the page and in the cookie; returns it, for the state. */
function apply(on: boolean, animate: boolean): boolean {
  const html = document.documentElement
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    html.dataset.privacySwitch = ''
    window.clearTimeout(switchTimer)
    switchTimer = window.setTimeout(() => delete html.dataset.privacySwitch, SWITCH_MS)
  }
  html.dataset.privacy = formatPrivacyCookie(on)
  document.cookie = cookieAssignment(PRIVACY_COOKIE, formatPrivacyCookie(on))
  return on
}

let switchTimer = 0
