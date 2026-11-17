'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { inputClass } from '@/components/accounts/add-account-form'
import { answerChallenge } from '@/components/auth/passkey-client'
import { formatPrivacyCookie, isPrivacyShortcut } from '@/lib/privacy'

// The bars' fade (globals.css, --privacy-wipe), and a little room for it to settle
const SWITCH_MS = 540

type Privacy = { on: boolean; toggle: () => void }
const PrivacyContext = createContext<Privacy>({ on: false, toggle: () => {} })

/**
 * Privacy mode (ENG-127, lib/privacy.ts): whether amounts are hidden, shared by the header
 * eye (desktop), the avatar card's row and the avatar's badge (phones, where the header has
 * no room for the eye). Also listens for the keyboard shortcut.
 *
 * Hiding is immediate. Showing again asks the signed-in person to confirm with their
 * passkey or password first (`confirmIdentity`, the login on), so someone else holding the
 * device can't simply turn it off. The cookie is httpOnly, so only /api/privacy changes it.
 */
export function PrivacyProvider({
  initial,
  confirmIdentity,
  hasPassword,
  children,
}: {
  initial: boolean
  confirmIdentity: boolean
  hasPassword: boolean
  children: React.ReactNode
}) {
  const [on, setOn] = useState(initial)
  const [unlocking, setUnlocking] = useState(false)
  const onRef = useRef(on)
  onRef.current = on

  /** After the server agreed (and checked the proof): the page follows; animate for a tap, not the shortcut */
  const set = useCallback(async (next: boolean, animate: boolean, proof: object = {}) => {
    await save(next, proof)
    // Showing: the bars fade out first, then the charts' axes change with the state
    await paint(next, animate)
    setOn(next)
  }, [])

  const request = useCallback(
    (animate: boolean) => {
      if (!onRef.current) {
        // Hiding never waits: the page hides at once, the cookie follows
        void paint(true, animate)
        setOn(true)
        void save(true).catch(() => {})
      } else if (confirmIdentity) {
        setUnlocking(true)
      } else {
        // Nothing to confirm (the login off): the bars fade out while the cookie is saved
        void Promise.all([paint(false, animate), save(false)])
          .then(() => setOn(false))
          .catch(() => {})
      }
    },
    [confirmIdentity, set]
  )

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

  return (
    <PrivacyContext.Provider value={{ on, toggle }}>
      {children}
      <UnlockDialog open={unlocking} onOpenChange={setUnlocking} hasPassword={hasPassword} show={proof => set(false, true, proof)} />
    </PrivacyContext.Provider>
  )
}

export const usePrivacy = () => useContext(PrivacyContext)

export const PRIVACY_LABEL = { on: 'הצגת הסכומים', off: 'הסתרת הסכומים' } as const

/**
 * Showing the amounts again: the person's password if they type it, else their passkey
 * (Face ID / Touch ID), the same as deleting all data (danger-zone.tsx). The server checks again.
 */
function UnlockDialog({
  open,
  onOpenChange,
  hasPassword,
  show,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasPassword: boolean
  show: (proof: object) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function change(next: boolean) {
    if (busy) return
    if (!next) {
      setPassword('')
      setError(null)
    }
    onOpenChange(next)
  }

  async function proof(): Promise<object> {
    if (password) return { password }
    const res = await fetch('/api/privacy/options', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'האישור נכשל')
    if (!data.passkey) throw new Error('אין לך מפתח. הקלידו את הסיסמה שלך כדי לאשר')
    return { flowId: data.passkey.flowId, response: await answerChallenge(data.passkey.options) }
  }

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await show(await proof())
      setBusy(false)
      setPassword('')
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'האישור נכשל')
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={change}
      onConfirm={confirm}
      title="להציג את הסכומים?"
      description="כדי להציג את הסכומים, אשרו עם הסיסמה או המפתח שלכם."
      confirmLabel="הצגה"
      destructive={false}
      busy={busy}
      busyLabel="מאשר…"
      error={error}
    >
      {hasPassword ? (
        <div className="space-y-1.5">
          <label htmlFor="privacy-password" className="text-sm font-medium">
            הסיסמה שלך
          </label>
          <input
            id="privacy-password"
            type="password"
            className={inputClass}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void confirm()
            }}
            autoComplete="current-password"
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">או השאירו ריק ואשרו עם Face ID, Touch ID או קוד המכשיר.</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">אחרי הלחיצה תתבקשו לאשר עם Face ID, Touch ID או קוד המכשיר.</p>
      )}
    </ConfirmDialog>
  )
}

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

/** The cookie, through /api/privacy (httpOnly: the page can't write it). Throws the server's refusal. */
async function save(on: boolean, proof: object = {}): Promise<void> {
  const res = await fetch('/api/privacy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ on, ...proof }),
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
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
