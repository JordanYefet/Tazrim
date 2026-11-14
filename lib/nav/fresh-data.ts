/**
 * The browser keeps pages it has shown (next.config.ts, staleTimes), so a tab
 * you were on a moment ago opens at once. The data only changes when
 * something is written, so the kept pages are dropped exactly then
 * (components/layout/fresh-data.tsx): after any write to the API, and when
 * the app comes back after a while away (a sync may have run meanwhile).
 */

import { isWriteBlocked } from '@/lib/read-only'

/**
 * Writes that change no data the pages show. /api/install restarts the app (ENG-121): a refresh
 * then would fail while it is down, and Next answers a failed refresh with a full reload, onto
 * the browser's "can't connect" page.
 */
const NOT_DATA = new Set(['/api/install'])

export function isDataWrite(method: string, pathname: string): boolean {
  return isWriteBlocked(method, pathname) && !NOT_DATA.has(pathname.replace(/\/+$/, ''))
}

/** Away at least this long and the pages are fetched again on return. */
export const AWAY_MS = 60_000

/** Back from the background: refresh if the app was hidden long enough. */
export function staleOnReturn(hiddenAt: number | null, now: number, away = AWAY_MS): boolean {
  return hiddenAt !== null && now - hiddenAt >= away
}
