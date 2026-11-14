'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BACKGROUND_COOKIE,
  backgroundHtmlAttributes,
  backgroundHtmlStyle,
  clampStrength,
  formatBackgroundCookie,
  parseBackgroundCookie,
  type BackgroundSetting,
} from '@/lib/background/setting'
import { cookieAssignment } from '@/lib/nav/state'
import { WALLPAPER_PROPERTIES, tileDataUri, tileStyle } from '@/lib/background/tile-svg'
import { crossfadeBackground } from './crossfade'

/*
 * The page background setting (ENG-72). The root layout reads the cookie and
 * renders <html data-bg …> and the background tile's URL with it, so the
 * first paint is right; a change here applies at once (attributes on <html>,
 * the new tile inline) and is remembered in the cookie for the next visit.
 * A new pattern or palette cross-fades in (./crossfade.ts); the strength
 * slider does not (it would stack a fade on every tick of a drag).
 *
 * `synced`: the background is stored for the signed-in person (or the household
 * with the login off), so it is the same on all their devices. A change made here
 * is saved there (the slider once it settles); one made on another device shows
 * when this one comes back to the front. The cookie stays a copy for pages without
 * a session (sign-in, setup). Not in the read-only demo.
 */

const SAVE_DELAY_MS = 400
const API = '/api/preferences/background'

function sameSetting(a: BackgroundSetting, b: BackgroundSetting): boolean {
  return a.kind === b.kind && a.palette === b.palette && clampStrength(a.strength) === clampStrength(b.strength)
}

interface BackgroundContextValue {
  setting: BackgroundSetting
  update: (next: Partial<BackgroundSetting>) => void
}

const BackgroundContext = createContext<BackgroundContextValue | null>(null)

export function useBackground(): BackgroundContextValue {
  const v = useContext(BackgroundContext)
  if (!v) throw new Error('useBackground outside BackgroundProvider')
  return v
}

function applyToDocument(s: BackgroundSetting) {
  const root = document.documentElement
  for (const [k, v] of Object.entries(backgroundHtmlAttributes(s))) root.setAttribute(k, v)
  for (const [k, v] of Object.entries(backgroundHtmlStyle(s))) root.style.setProperty(k, v)
  // A wallpaper's extra properties go when another background comes
  for (const k of WALLPAPER_PROPERTIES) root.style.removeProperty(k)
  for (const [k, v] of Object.entries(tileStyle(s, tileDataUri))) root.style.setProperty(k, v)
}

export function BackgroundProvider({ initial, synced = false, children }: { initial: BackgroundSetting; synced?: boolean; children: ReactNode }) {
  const [setting, setSetting] = useState(initial)
  // A setting that came from another device: shown here, not saved back
  const remote = useRef<BackgroundSetting | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const update = useCallback((next: Partial<BackgroundSetting>) => {
    setSetting(prev => {
      const s = { ...prev, ...next }
      s.strength = clampStrength(s.strength)
      return s
    })
  }, [])

  // Apply and remember every change (not the first render: the server already painted it)
  const first = useRef(true)
  const shown = useRef(setting)
  useEffect(() => {
    if (first.current) {
      first.current = false
      // The server may have painted the person's stored background, not this device's cookie
      document.cookie = cookieAssignment(BACKGROUND_COOKIE, formatBackgroundCookie(setting))
      return
    }
    const prev = shown.current
    shown.current = setting
    if (prev.kind !== setting.kind || prev.palette !== setting.palette) crossfadeBackground(() => applyToDocument(setting))
    else applyToDocument(setting)
    document.cookie = cookieAssignment(BACKGROUND_COOKIE, formatBackgroundCookie(setting))
    const fromElsewhere = remote.current !== null && sameSetting(remote.current, setting)
    remote.current = null
    if (!synced || fromElsewhere) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(API, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: formatBackgroundCookie(setting) }),
      }).catch(() => {
        // Offline: this device keeps it (cookie); the next change saves again
      })
    }, SAVE_DELAY_MS)
  }, [setting, synced])

  // Back to the front: a background chosen on another device in the meantime shows here too
  useEffect(() => {
    if (!synced) return
    const check = () => {
      if (document.visibilityState !== 'visible') return
      fetch(API)
        .then(r => (r.ok ? r.json() : null))
        .then((body: { value?: string | null } | null) => {
          if (!body?.value) return
          const next = parseBackgroundCookie(body.value)
          setSetting(prev => {
            if (sameSetting(prev, next)) return prev
            remote.current = next
            return next
          })
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [synced])

  const value = useMemo(() => ({ setting, update }), [setting, update])
  return (
    <BackgroundContext.Provider value={value}>
      {children}
    </BackgroundContext.Provider>
  )
}
