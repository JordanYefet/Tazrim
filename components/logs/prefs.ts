'use client'

/**
 * The debug window's settings, per device (ENG-104): in this browser's localStorage, not the
 * server's, so the window can be on for a phone and off for the computer. One store for the
 * Settings page and the window, which both read it (useSyncExternalStore) and react at once,
 * also across tabs.
 */
import { useSyncExternalStore } from 'react'
import type { Detail, Tab } from '@/lib/log/view'

export type WindowMode = 'min' | 'open' | 'max'

export interface LogPrefs {
  /** The window is on (Settings → Debug) */
  on: boolean
  /** Collapsed bar, open, or enlarged with the details pane */
  mode: WindowMode
  tab: Tab
  grouped: boolean
  /** What goes into the window at all */
  detail: Detail
}

export const DEFAULT_PREFS: LogPrefs = { on: false, mode: 'open', tab: 'all', grouped: false, detail: 'info' }

const KEY = 'tazrim.logs'
const EVENT = 'tazrim-log-prefs'

const MODES: WindowMode[] = ['min', 'open', 'max']
const TABS: Tab[] = ['all', 'app', 'sync', 'problems']
const DETAILS: Detail[] = ['errors', 'info', 'debug']

/** What was stored, with anything unexpected back to its default */
export function parsePrefs(raw: string | null): LogPrefs {
  try {
    const v = JSON.parse(raw ?? '{}') as Partial<LogPrefs>
    return {
      on: v.on === true,
      mode: MODES.includes(v.mode as WindowMode) ? (v.mode as WindowMode) : DEFAULT_PREFS.mode,
      tab: TABS.includes(v.tab as Tab) ? (v.tab as Tab) : DEFAULT_PREFS.tab,
      grouped: v.grouped === true,
      detail: DETAILS.includes(v.detail as Detail) ? (v.detail as Detail) : DEFAULT_PREFS.detail,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

let cachedRaw: string | null | undefined
let cached: LogPrefs = DEFAULT_PREFS

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function snapshot(): LogPrefs {
  const raw = read()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = parsePrefs(raw)
  }
  return cached
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function setLogPrefs(patch: Partial<LogPrefs>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...snapshot(), ...patch }))
  } catch {
    // Storage blocked: the change lasts until the page closes
    cached = { ...cached, ...patch }
  }
  window.dispatchEvent(new Event(EVENT))
}

/** The server renders the defaults (window off); the browser reads its own */
export function useLogPrefs(): LogPrefs {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFS)
}
