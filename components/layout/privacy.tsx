'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatPrivacyCookie, isPrivacyShortcut } from '@/lib/privacy'
import { prefersReducedMotion } from '@/lib/a11y/media'

// The bars' fade (globals.css, --privacy-wipe), and a little room for it to settle
const SWITCH_MS = 540

type Privacy = { on: boolean; toggle: () => void }
const PrivacyContext = createContext<Privacy>({ on: false, toggle: () => {} })

/**
 * Privacy mode (ENG-127, lib/privacy.ts): whether amounts are hidden, shared by the header
 * eye (desktop), the avatar card's row and the avatar's badge (phones, where the header has
 * no room for the eye). Also listens for the keyboard shortcut.
 *
 * Hiding and showing are both immediate: the page changes at once and the cookie follows
 * (httpOnly, so only /api/privacy sets it). Showing keeps the mode on while the bars fade out.
 */
export function PrivacyProvider({ initial, children }: { initial: boolean; children: React.ReactNode }) {
  const [on, setOn] = useState(initial)
  const onRef = useRef(on)
  onRef.current = on

  /** Animate for a tap, not the shortcut */
  const request = useCallback((animate: boolean) => {
    const next = !onRef.current
    onRef.current = next
    void save(next).catch(() => {})
    if (next) {
      void paint(true, animate)
      setOn(true)
    } else {
      // The bars fade out first, then the charts' axes change with the state
      void paint(false, animate).then(() => setOn(false))
    }
  }, [])

  const toggle = useCallback(() => request(true), [request])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isPrivacyShortcut(e)) return
      e.preventDefault()
      request(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request])

  return <PrivacyContext.Provider value={{ on, toggle }}>{children}</PrivacyContext.Provider>
}

export const usePrivacy = () => useContext(PrivacyContext)

export const PRIVACY_LABEL = { on: 'הצגת הסכומים', off: 'הסתרת הסכומים' } as const

/** The header's eye, from md up. While on it is tinted, which is also the sign that amounts are hidden. */
export function PrivacyButton({ className }: { className?: string }) {
  const { on, toggle } = usePrivacy()
  const [shortcut, setShortcut] = useState('')
  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘⇧.' : 'Ctrl+Shift+.')
  }, [])

  const label = on ? PRIVACY_LABEL.on : PRIVACY_LABEL.off
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={label}
      aria-keyshortcuts="Meta+Shift+Period Control+Shift+Period"
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        // 36px, like the search button and the avatar beside it
        'relative h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'before:absolute before:-inset-1 before:content-[""]',
        on ? 'border-primary/30 bg-primary/15 text-primary' : 'border-border bg-muted text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {on ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
    </button>
  )
}

const PHONE = '(max-width: 767.98px)'

/** Below md: the header shows no eye, so the avatar card has the switch and the avatar the badge */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    notify => {
      const mq = matchMedia(PHONE)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    () => matchMedia(PHONE).matches,
    () => false
  )
}

/** The cookie, through /api/privacy (httpOnly: the page can't write it). */
async function save(on: boolean): Promise<void> {
  const res = await fetch('/api/privacy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ on }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'לא הצלחנו לשנות את מצב הפרטיות')
}

/**
 * Shows or hides the amounts on the page. Animated (a tap, motion allowed): hiding fades the bars
 * in at once; showing keeps the mode on while the bars fade out, and resolves when they are gone.
 */
function paint(on: boolean, animate: boolean): Promise<void> {
  const html = document.documentElement
  window.clearTimeout(switchTimer)
  if (!animate || prefersReducedMotion()) {
    delete html.dataset.privacySwitch
    html.dataset.privacy = formatPrivacyCookie(on)
    return Promise.resolve()
  }
  html.dataset.privacySwitch = on ? 'in' : 'out'
  if (on) html.dataset.privacy = formatPrivacyCookie(true)
  return new Promise(done => {
    switchTimer = window.setTimeout(() => {
      html.dataset.privacy = formatPrivacyCookie(on)
      delete html.dataset.privacySwitch
      done()
    }, SWITCH_MS)
  })
}

let switchTimer = 0
