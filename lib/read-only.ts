/**
 * Read-only mode, for the public demo: TAZRIM_READ_ONLY=1.
 *
 * The app looks and behaves as usual, but nothing is saved: middleware.ts
 * refuses every write to the API (the lock), and components/layout/read-only-guard.tsx
 * stops those requests in the browser first, so a save never looks as if it
 * worked, and explains why.
 */

export const READ_ONLY_MESSAGE = 'זהו דמו לקריאה בלבד: שינויים לא נשמרים'

/** POST routes that save nothing (they parse or compute), so forms work up to their save */
// Privacy mode (ENG-127) is a cookie for this browser only, so the demo can hide its amounts too;
// so are the accessibility options (ENG-128: the route only sets a cookie when nothing can be stored)
const READ_ONLY_POSTS = new Set(['/api/upload/preview', '/api/recurring/manual/preview', '/api/privacy', '/api/preferences/accessibility'])

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isReadOnly(): boolean {
  const v = process.env.TAZRIM_READ_ONLY
  return v === '1' || v === 'true'
}

/** Would this request change data? (an API write that isn't one of the read-only previews) */
export function isWriteBlocked(method: string, pathname: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return false
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path !== '/api' && !path.startsWith('/api/')) return false
  return !READ_ONLY_POSTS.has(path)
}

export const UPDATING_MESSAGE = 'תזרים מתעדכן עכשיו. שינויים יישמרו אחרי העדכון.'

/** While an update runs (lib/updates/paths.ts flag): every write is paused except the update routes themselves */
export function isWriteBlockedWhileUpdating(method: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/api/updates' || path.startsWith('/api/updates/')) return false
  return isWriteBlocked(method, pathname)
}
