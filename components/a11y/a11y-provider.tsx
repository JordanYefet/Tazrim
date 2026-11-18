'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  A11Y_COOKIE,
  A11Y_DEFAULTS,
  a11yAttribute,
  formatA11y,
  normalizeA11y,
  sameA11y,
  type A11ySettings,
} from '@/lib/a11y/settings'
import { cookieAssignment } from '@/lib/nav/state'

/*
 * The accessibility options (ENG-128). The root layout puts them on <html> as data-a11y on the
 * server, so the first paint is right. A change here is applied to <html> at once, then saved
 * (optimistic: if the save fails, the change is taken back and `error` says so). The PUT also
 * sets the cookie copy for pages without a session; the cookie is written here as well, so
 * this device keeps it even if the request fails.
 *
 * It is one attribute, not classes: a server re-render of <html> (router.refresh) only touches
 * the attribute, so next-themes' `dark` class on the same element is never overwritten.
 */

const API = '/api/preferences/accessibility'

interface A11yContextValue {
  settings: A11ySettings
  /** Set one or more options; applied at once, saved in the background */
  update: (next: Partial<A11ySettings>) => void
  reset: () => void
  /** A failed save (the change was taken back), until the next change */
  error: string | null
}

const A11yContext = createContext<A11yContextValue | null>(null)

export function useA11y(): A11yContextValue {
  const v = useContext(A11yContext)
  if (!v) throw new Error('useA11y outside A11yProvider')
  return v
}

/** <html data-a11y>: React only ever sets this attribute, never the class next-themes keeps there */
function applyToDocument(s: A11ySettings) {
  const value = a11yAttribute(s)
  const root = document.documentElement
  if (value) root.setAttribute('data-a11y', value)
  else root.removeAttribute('data-a11y')
}

export function A11yProvider({ initial, synced = false, children }: { initial: A11ySettings; synced?: boolean; children: ReactNode }) {
  const [settings, setSettings] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  // What the server has (to take a failed change back to), and the newest save in flight
  const saved = useRef(initial)
  const latest = useRef(settings)
  latest.current = settings
  const seq = useRef(0)

  // Whatever changes the settings (a switch, a failed save taken back, another device) reaches <html>
  useLayoutEffect(() => applyToDocument(settings), [settings])

  // The server painted the person's stored options, not this device's cookie: keep the cookie a copy of them
  useEffect(() => {
    document.cookie = cookieAssignment(A11Y_COOKIE, formatA11y(initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = useCallback(
    (next: A11ySettings) => {
      document.cookie = cookieAssignment(A11Y_COOKIE, formatA11y(next))
      const mine = ++seq.current
      fetch(API, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      })
        .then(res => {
          if (!res.ok) throw new Error(String(res.status))
          if (mine === seq.current) saved.current = next
        })
        .catch(() => {
          // Only the newest change is taken back, to what the server has
          if (mine !== seq.current) return
          const back = saved.current
          document.cookie = cookieAssignment(A11Y_COOKIE, formatA11y(back))
          setSettings(back)
          setError('השינוי לא נשמר. נסו שוב.')
        })
    },
    []
  )

  const apply = useCallback(
    (next: A11ySettings) => {
      if (sameA11y(next, latest.current)) return
      setError(null)
      applyToDocument(next)
      latest.current = next
      setSettings(next)
      save(next)
    },
    [save]
  )

  const update = useCallback((next: Partial<A11ySettings>) => apply(normalizeA11y({ ...latest.current, ...next })), [apply])
  const reset = useCallback(() => apply({ ...A11Y_DEFAULTS }), [apply])

  // Back to the front: options chosen on another device in the meantime show here too
  useEffect(() => {
    if (!synced) return
    const check = () => {
      if (document.visibilityState !== 'visible') return
      fetch(API)
        .then(r => (r.ok ? r.json() : null))
        .then((body: { value?: unknown } | null) => {
          if (!body?.value) return
          const next = normalizeA11y(body.value)
          if (sameA11y(next, latest.current)) return
          saved.current = next
          latest.current = next
          setSettings(next)
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [synced])

  const value = useMemo(() => ({ settings, update, reset, error }), [settings, update, reset, error])
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>
}
