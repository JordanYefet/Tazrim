/**
 * The browser keeps pages it has shown (next.config.ts, staleTimes), so a tab
 * you were on a moment ago opens at once. The data only changes when
 * something is written, so the kept pages are dropped exactly then
 * (components/layout/fresh-data.tsx): after any write to the API, and when
 * the app comes back after a while away (a sync may have run meanwhile).
 */

export { isWriteBlocked as isDataWrite } from '@/lib/read-only'

/** Away at least this long and the pages are fetched again on return. */
export const AWAY_MS = 60_000

/** Back from the background: refresh if the app was hidden long enough. */
export function staleOnReturn(hiddenAt: number | null, now: number, away = AWAY_MS): boolean {
  return hiddenAt !== null && now - hiddenAt >= away
}
