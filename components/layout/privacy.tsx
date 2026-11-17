'use client'

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { cookieAssignment } from '@/lib/nav/state'
import { PRIVACY_COOKIE, formatPrivacyCookie, isPrivacyShortcut } from '@/lib/privacy'

// How long <html data-privacy-switch> stays on, so the blur eases in or out (globals.css)
const SWITCH_MS = 400

type Privacy = { on: boolean; toggle: () => void }
const PrivacyContext = createContext<Privacy>({ on: false, toggle: () => {} })

/**
 * Privacy mode (ENG-127, lib/privacy.ts): whether amounts are blurred, shared by the header
 * eye (desktop), the avatar card's row and the avatar's badge (phones, where the header has
 * no room for the eye). Also listens for the keyboard shortcut. A tap eases the blur in or
 * out; the shortcut and reduced motion switch at once.
 */
export function PrivacyProvider({ initial, children }: { initial: boolean; children: React.ReactNode }) {
  const [on, setOn] = useState(initial)
  const toggle = useCallback(() => setOn(o => apply(!o, true)), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isPrivacyShortcut(e)) return
      e.preventDefault()
      setOn(o => apply(!o, false))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
