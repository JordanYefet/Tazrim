'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BACKGROUND_COOKIE,
  backgroundHtmlAttributes,
  backgroundHtmlStyle,
  clampStrength,
  formatBackgroundCookie,
  type BackgroundSetting,
} from '@/lib/background/setting'
import { cookieAssignment } from '@/lib/nav/state'
import { tileDataUri, tileStyle } from '@/lib/background/tile-svg'

/*
 * The page background setting (ENG-72). The root layout reads the cookie and
 * renders <html data-bg …> and the background tile's URL with it, so the
 * first paint is right; a change here applies at once (attributes on <html>,
 * the new tile inline) and is remembered in the cookie for the next visit.
 */

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
  for (const [k, v] of Object.entries(tileStyle(s, tileDataUri))) root.style.setProperty(k, v)
}

export function BackgroundProvider({ initial, children }: { initial: BackgroundSetting; children: ReactNode }) {
  const [setting, setSetting] = useState(initial)

  const update = useCallback((next: Partial<BackgroundSetting>) => {
    setSetting(prev => {
      const s = { ...prev, ...next }
      s.strength = clampStrength(s.strength)
      return s
    })
  }, [])

  // Apply and remember every change (not the first render: the server already painted it)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    applyToDocument(setting)
    document.cookie = cookieAssignment(BACKGROUND_COOKIE, formatBackgroundCookie(setting))
  }, [setting])

  const value = useMemo(() => ({ setting, update }), [setting, update])
  return (
    <BackgroundContext.Provider value={value}>
      {children}
    </BackgroundContext.Provider>
  )
}
