'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import {
  A11Y_ALL_CLASSES,
  A11Y_COOKIE,
  A11Y_DEFAULTS,
  a11yClasses,
  formatA11y,
  normalizeA11y,
  sameA11y,
  type A11ySettings,
} from '@/lib/a11y/settings'
import { cookieAssignment } from '@/lib/nav/state'

/*
 * The accessibility options (ENG-128). The root layout puts their classes on <html> on the
 * server, so the first paint is right. A change here is applied to <html> at once, then saved
 * (optimistic: if the save fails, the change is taken back and `error` says so). The PUT also
 * sets the cookie copy for pages without a session; the cookie is written here as well, so
 * this device keeps it even if the request fails.
 *
 * Why the layout effect re-applies the classes: the server renders <html className>, and when it
 * re-renders the layout (router.refresh) React sets className to the new value, which drops
 * next-themes' `dark` class and anything this provider added since. Re-applying after every
 * render puts both back before the browser paints.
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

function applyToDocument(s: A11ySettings) {
  const list = document.documentElement.classList
  const want = new Set(a11yClasses(s).split(' ').filter(Boolean))
  for (const c of A11Y_ALL_CLASSES) {
    if (want.has(c)) list.add(c)
    else list.remove(c)
  }
}

export function A11yProvider({ initial, synced = false, children }: { initial: A11ySettings; synced?: boolean; children: ReactNode }) {
  const [settings, setSettings] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const { resolvedTheme } = useTheme()
  // What the server has (to take a failed change back to), and the newest save in flight
  const saved = useRef(initial)
  const latest = useRef(settings)
  latest.current = settings
  const seq = useRef(0)

  // After every render: the classes (and the theme's, which a server re-render of <html> may have dropped)
  useLayoutEffect(() => {
    applyToDocument(settings)
    const root = document.documentElement
    if (resolvedTheme === 'dark') root.classList.add('dark')
    else if (resolvedTheme === 'light') root.classList.remove('dark')
  })

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
